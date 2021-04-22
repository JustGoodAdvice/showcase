import _ from "lodash";
import copy from "clipboard-copy";
import Handlebars from "handlebars";
import Inputmask from "inputmask";
import Loading from "../loading";
import pluralize from "pluralize";
import qs from "querystring";
import store from "store";
import isHtml from "is-html";
import numeral from "numeral";

export default class TaffrailApi {
  constructor() {

    // handlebars helpers
    Handlebars.registerHelper("ifEquals", function(arg1, arg2, options) {
      return (arg1 === arg2) ? options.fn(this) : options.inverse(this);
    });

    Handlebars.registerHelper("ifNotEquals", function(arg1, arg2, options) {
      return (arg1 != arg2) ? options.fn(this) : options.inverse(this);
    });

    Handlebars.registerHelper("breaklines", (text) => {
      if (text && !text.includes("<taffrail-var") && !isHtml(text)) {
        text = Handlebars.Utils.escapeExpression(text);
      }
      text = String(text).replace(/(\r\n|\n|\r)/gm, "<br>");
      return new Handlebars.SafeString(text);
    });

    Handlebars.registerHelper("toString", (x) => {
      return (x === void 0) ? "undefined" : String(x);
    });
  }

  /**
   * Page onload, one time
   */
  init() {
    // use the "published" channel by default
    this.config.api_channel = "published";

    // set the base URL for loading data
    window.jga.api._links = { self: `${this.config.api_host}/api/advice/${this.api.adviceset.id}` }

    // helpers
    $("body").tooltip({ selector: "[data-toggle=tooltip]" });
    this.$loadingContainer = $(".advice-outer-container");

    // mode
    this.primaryAdviceModeEnabled = store.get("primaryAdviceModeEnabled", false);
    this.adviceEditorModeEnabled = store.get("adviceEditorModeEnabled", false);
    if (this.adviceEditorModeEnabled) {
      $("html").addClass("advice-editor-mode-enabled");
    }
    // events
    this.initCache();
    this.handleClickContinue();
    this.handleClickBack();
    this.handleClickAssumption();
    this.handleClickTaffrailVar();
    this.handleCollapseAssumptionGroup();
    this.handleCollapseAdviceSummaries();
    // this.handleChangeAudience();
    // this.handleCopyLink();
    this.handleClickOpenRawDataModal();
    // this.handleClickShowAllSources();
  }

  // #region getter/setter
  get api() {
    return window.jga.api;
  }

  set api(data) {
    // save a new property with stringified params
    // for use in advice builder debug URLs
    data.paramsAsQueryStr = qs.stringify(data.params);

    window.jga.api = data;
  }

  get config() {
    return window.jga.config;
  }

  get baseUrl() {
    const prefix = "frb/v2/goal-planning/goals/taffrail";
    return `/${prefix}/${this.api.adviceset.id}`;
  }

  // these are API params set by default
  // do not save them as visible parts of the URL or in Advice Builder scenarios
  get paramsToOmit() {
    return ["include", "showcase", "returnFields"];
  }

  // eslint-disable-next-line accessor-pairs
  set windowTitle(title) {
    document.title = title;
  }
  // #endregion

  // #region data
  /**
   * Slight speed update to cache frequently-used templates and selectors
   */
  initCache() {
    // cache element selectors
    this.$advice = $(".advice");
    // cache templates
    this.TEMPLATES = {
      "AdviceSetDetails": Handlebars.compile($("#tmpl_adviceSetDetails").html()),
      "InputRequest": Handlebars.compile($("#tmpl_adviceInputRequest").html()),
      "Advice": Handlebars.compile($("#tmpl_adviceAdvice").html()),
      "Recommendations": Handlebars.compile($("#tmpl_groupedRecommendationsAdviceList").html()),
      "AdviceDebugSidebar": Handlebars.compile($("#tmpl_adviceDebugSidebar").html()),
      "Assumptions": Handlebars.compile($("#tmpl_assumptionsList").html()),
      "QuestionsAnswers": Handlebars.compile($("#tmpl_answersList").html()),
      "Error": Handlebars.compile($("#tmpl_error").html()),
    };
  }

  /**
   * Capture new form data, merge with current state and make new Advice API request.
   * @param {object} newFormData Form data from input request.
   * @param {jQuery} $loadingContainer
   * @param {boolean} usePlaceholder
   * @returns Promise<jqXHR>
   */
  load(newFormData, $loadingContainer = this.$loadingContainer, usePlaceholder = true) {
    const currFormData = this.api.params;
    const userProfileData = window.jga.UserProfile ? _.omit(window.jga.UserProfile.savedProfile, "_name") : {};
    const include = ["filteredVars", "formulaDebug"];
    const formData = _.assign(
      {
        include: include,
        showcase: true
      },
      userProfileData,
      currFormData,
      qs.parse(newFormData)
    );
    // does link contain referring AI User Request ID (aiUrId)?
    this.fromAiUrId = formData.aiUrId;
    // internal JGA: don't include these fields
    delete formData.returnFields;

    // USE PUBLISHED CHANNEL
    if (this.config.api_channel == "published") {
      this.api._links.self = this.api._links.self.replace(this.config.api_host, this.config.api_engine_host);
    }

    const [apiUrlWithoutQuerystring] = this.api._links.self.split("?");
    const loadingId = Loading.show($loadingContainer, undefined, usePlaceholder);

    return $.ajax({
      url: apiUrlWithoutQuerystring,
      type: "GET",
      dataType: "json",
      headers: {
        "Accept": "application/json; chartset=utf-8",
        "Authorization": `Bearer ${this.config.api_key}`
      },
      contentType: "application/json",
      data: formData
    }).then(api => {
      // Advice API (preview mode) can return HTTP 200 (success)
      // with an error, so we'll inject that error into the `adviceset`
      // place, so the error shows up on top.
      if (api.error) {
        Loading.hide(loadingId);
        return Promise.reject(new Error(api.error.message));
      }
      // update global!
      this.api = api.data;
      this.setActiveAudience(formData.audienceId);
      Loading.hide(loadingId);
      return api;
    }).catch((jqXHR) => {
      let err;
      let reason = "";
      if (jqXHR.responseJSON) {
        err = jqXHR.responseJSON.error.message;
        if (jqXHR.responseJSON.error.reason) {
          ({ reason } = jqXHR.responseJSON.error);
        }
      } else if (jqXHR.statusText) {
        err = jqXHR.statusText;
      } else {
        err = jqXHR.message;
      }
      if (reason) {
        err += ` (${reason})`;
      }
      this.api = _.assign({}, window.jga.api, {
        error: {
          title: "Error",
          description: err != "error" ? err : "API unavailable",
        },
        advice: []
      });
      Loading.hide(loadingId);
      const str = this.TEMPLATES["Error"](this.api);
      this.$advice.html(str);
    });
  }

  /**
   * Map data from API for this showcase's handlebars templates
   */
  mapData() {
    // setup "display" card — either question or "advice".
    // `api.advice` is an array of every input + advice node
    this.api.display = _.last(this.api.advice) || {};
    // build collection of just answers/assumptions
    this.api.answers = this.api.advice.filter(a => { return a.type == "INPUT_REQUEST"; }).map((a, i) => {
      a.idx = i;
      return a;
    });

    // remove last item, it's always an unanswered question
    if (this.api.display.type == "INPUT_REQUEST") {
      this.api.answers.pop();
    }

    // assumptions are grouped, answers are not
    const ASSUMPTIONS_UNGROUPED = "Assumptions";
    this.api.assumptions = _.groupBy(this.api.answers, (a) => {
      return (a.tagGroup) ? a.tagGroup.name : ASSUMPTIONS_UNGROUPED;
    });

    // fix input requests with boolean variables in statements
    this.fixInputRequestsWithBooleanVars();
    this.filterAssumptionsWithoutStatement();

    // go through each assumption group and set open/close state
    Object.keys(this.api.assumptions).forEach((key, idx) => {
      // add `_isOpen` flag to each item
      const arr = this.api.assumptions[key];
      this.api.assumptions[key] = arr.map(a => {
        if (key == ASSUMPTIONS_UNGROUPED) {
          a.tagGroup = {
            id: "ag",
            name: ASSUMPTIONS_UNGROUPED
          }
        }
        a._isOpen = store.get(`assumption_${a.tagGroup.id}_${this.api.adviceset.id}`, false);
        return a;
      });
    });

    this.putPersonalProfileFirst();
    this.deleteEmptyDefaultAssumptionGroup(ASSUMPTIONS_UNGROUPED);

    this.mapAdviceData();
  }

  /**
   * Helper to find the "last" Advice node, including a check for the
   * System Advice Node with special ID -32768
   */
  // eslint-disable-next-line complexity
  mapAdviceData() {
    // if the `display` is the LAST advice node, set the "isLast" flag
    const allAdvice = this.api.advice.filter(a => { return a.type == "ADVICE"; });
    const lastAdvice = _.last(allAdvice);
    if (lastAdvice && this.api.display.id == lastAdvice.id) {
      lastAdvice._isLast = true;
      // if the last advice node is an Advice Engine Response with this special ID
      // and `isEnd` property, pop it off the end of the `advice` array
      // (so it doesn't appear in the recommendations) and consider the rule "done"...
      if (lastAdvice.id == "-32768" && lastAdvice.properties.isEnd) {
        // ...but only pop if there are other Advice nodes. the showcase page shouldn't be blank
        // if there are no other questions or nodes to display.
        if (allAdvice.length > 1) {
          allAdvice.pop();
        } else {
          const { headline: origHeadline } = lastAdvice;
          lastAdvice.headline = "All done!";
          lastAdvice.summary = `There is nothing more to say, this is the ${origHeadline}.`;

          if (this.api.error) {
            lastAdvice.summary += `\n\n${this.api.error.name}\n${this.api.error.message}`;
            if (this.api.error.data) {
              lastAdvice.summary_html = lastAdvice.summary + `. <a href="${this.api._links.self}" target=_blank class="text-secondary">Open API</a>`;
            }
          }
        }
      }
    }

    // group all advice into bucketed recommendations
    let groupedAdvice = _.groupBy(allAdvice, (a) => {
      return (a.tagGroup) ? a.tagGroup.name : "Recommendations";
    });

    // This is hard to read but straightforward chained lodash logic. Steps:
    // 1.convert groupedAdvice object `toPairs` (new array of arrays [[tagGroup, itemsArr]])
    // 2.sort by weight of tagGroup (pull from 1st item)
    // 3.convert `fromPairs` back to object
    // 4.retrieve chained value
    //
    // Cribbed from:
    // https://github.com/lodash/lodash/issues/1459#issuecomment-253969771
    groupedAdvice = _(groupedAdvice).toPairs().sortBy([(group) => {
      const [/* key*/, items] = group;
      // get the weight (defaults to 0) from first item in group
      const { tagGroup: { weight = 0 } = {} } = _.first(items);
      return weight;
    }]).fromPairs().value();

    const groupKeys = Object.keys(groupedAdvice);

    // add handlebars helpers
    groupKeys.forEach((key, idx) => {
      // map each array of advice with some props
      groupedAdvice[key] = groupedAdvice[key].map(a => {
        // determine if this is an interactive chart attachment
        const { attachment } = a;
        let isChart = false;
        if (attachment) {
          isChart = attachment.contentType == "application/vnd+interactive.chart+html";
          // handlebars helper
          attachment._isInteractiveChart = isChart;
        }

        // only show icon for advice with summary or attachment
        let icon = "";
        if (a.summary && isChart) {
          icon = "fal fa-chevron-down";
        } else if (a.summary) {
          icon = "fal fa-chevron-right";
        } else {
          icon = "fal fa-circle bullet-sm";
        }
        // handlebars helper
        a._icon = icon;

        return a;
      });
    });

    // find "primary advice" -- last advice in highest weighted group
    const [highestWeightedGroup] = groupKeys;
    if (groupedAdvice[highestWeightedGroup] && groupedAdvice[highestWeightedGroup].length) {
      const primaryAdvice = _.last(groupedAdvice[highestWeightedGroup]);
      primaryAdvice._isPrimary = true;

      if (this.primaryAdviceModeEnabled) {
        // assign it to temp prop
        this.api.display_primary_advice = primaryAdvice;
        // remove it from list that will become `recommendations`
        groupedAdvice[highestWeightedGroup].pop();
        // are there any recommendations left in this group?
        if (!groupedAdvice[highestWeightedGroup].length) {
          delete groupedAdvice[highestWeightedGroup];
        }

        // build a string for use below primary advice
        const varStr = ` ${pluralize("inputs", this.api.variables.length, true)}`;
        let factoredStr = "";
        const assumptionLen = _.flatMap(this.api.assumptions).length;
        const recommendationLen = _.flatMap(groupedAdvice).length;
        if (assumptionLen > 0) {
          factoredStr = `${pluralize("assumption", assumptionLen, true)}`;
        }
        this.api.display_primary_advice._evaluated = `<strong>${factoredStr}</strong> and <strong>${varStr}</strong>`;
        this.api.display_primary_advice._recommended = `${pluralize("recommendation", recommendationLen, true)}`;
      }
    }

    // all advice to render is saved to `recommendations`
    this.api.recommendations = groupedAdvice;

    // add config to api data because handlebars can't access `jga` global
    this.api.config = window.jga.config;

    this.mapVariables();
  }

  updateMainPane() {
    $("#showcase_url").prop("href", `/s/${this.api.adviceset.id}/?${this.api.paramsAsQueryStr}`).prop("target", "_blank");
    this._setCurrentIdx();
    if (this.api.display.type == "INPUT_REQUEST") {
      this.updateForInputRequest();
    } else {
      // see controllers which `updateForAdvice`
    }
  }

  updatePanes() {
    // update the window title
    this.windowTitle = `${this.api.adviceset.title} - POC - Taffrail`;
    this.updateAssumptionsList();
    this.updateRecommendationsList();
    this.updateAdviceDebugSidebar();
    this.updateVariablesList();
    this.updateSaveGoalButton();
    this.updateTaffrailVarHtml();
  }

  /**
   * Remove any assumptions without statements
   */
  filterAssumptionsWithoutStatement() {
    Object.keys(this.api.assumptions).forEach((key, idx) => {
      const arr = this.api.assumptions[key];
      this.api.assumptions[key] = arr.filter(a => {
        return a.statement;
      })
    });
  }

  /**
   * Fix input requests with boolean variables in statements
   */
  fixInputRequestsWithBooleanVars() {
    Object.keys(this.api.assumptions).forEach((key, idx) => {
      const arr = this.api.assumptions[key];
      this.api.assumptions[key] = arr.map(a => {
        const { answer, form: { fieldType, name } } = a;
        // for input requests using a boolean variable *with variables used in statements*
        // replace the variable's value (`true` or `false`) with the `answer` (`Yes` or `No`)
        // where the variable exists in the statement
        if (fieldType == "Boolean" && a.statement && a.statement_raw) {
          const h = Handlebars.compile(a.statement_raw)({
            [name]: answer
          });
          a.statement = h;
        }
        return a;
      });
    });
  }

  /**
   * Delete default assumption group if no statements exist
   * @param {string} ASSUMPTIONS_UNGROUPED
   */
  deleteEmptyDefaultAssumptionGroup(ASSUMPTIONS_UNGROUPED) {
    if (this.api.assumptions[ASSUMPTIONS_UNGROUPED] && this.api.assumptions[ASSUMPTIONS_UNGROUPED].length === 0) {
      delete this.api.assumptions[ASSUMPTIONS_UNGROUPED];
    }
  }

  /**
   * Sort assumptions so Personal Profile is always first
   */
  putPersonalProfileFirst() {
    if (Object.keys(this.api.assumptions).includes("Personal Profile")) {
      this.api.assumptions = {
        "Personal Profile": this.api.assumptions["Personal Profile"],
        ...this.api.assumptions
      }
    }
  }

  /**
 * Template update for INPUT_REQUEST
 */
  updateForInputRequest($container = this.$advice) {
    // render
    // eslint-disable-next-line new-cap
    const str = this.TEMPLATES["InputRequest"](this.api);
    $container.html(str);

    // hide "next" button unless it's a numeric input
    // const isRadio = this.api.display.form.fieldType.match(/Radio|Boolean/);
    // $container.find("button[type=submit]").toggle(!(isRadio && isRadio.length > 0));

    // set value
    this._setValue($container);
    // // set input masks
    this._handleInputMasks($container);
    // // focus input
    this._focusFirstInput($container);
  }

  updateForAdvice() {
    // unhighlight active assumption/question
    this._setAssumptionActive("advice");
  }

  /**
 * Update assumptions/answers/history list
 */
  updateAssumptionsList() {
    // do we have ANY assumptions/answers yet?
    // show or hide depending
    // simple helper for UX
    this.api._answersExist = this.api.answers.length > 0;
    $(".assumptions-container > div").css("visibility", this.api._answersExist ? "visible" : "hidden");
    $(".assumptions-outer-container").toggleClass("assumptions-outer-container--empty", !this.api._answersExist);
    // only show expand button if there's grouped assumptions besides "ungrouped"
    $(".assumption-expander").toggle(_.without(Object.keys(this.api.assumptions), "ungrouped").length > 0);

    // render
    // eslint-disable-next-line new-cap
    const str = this.TEMPLATES["QuestionsAnswers"](this.api);
    // eslint-disable-next-line new-cap
    const strAssump = this.TEMPLATES["Assumptions"](this.api);
    $(".answers").html(str);
    $(".assumptions").html(strAssump);
  }

  /**
   * Update advice list by group
   */
  updateRecommendationsList() {
    // simple helper for UX
    const recommendationGroupCount = Object.keys(this.api.recommendations).length;
    this.api._recommendationsExist = _.flatMap(this.api.recommendations).length > 0;
    this.api._referenceDocumentsExist = false;
    this.api._showPrimaryPersonalized = (this.api._recommendationsExist && recommendationGroupCount >= 2) || this.api._referenceDocumentsExist;

    // render
    // eslint-disable-next-line new-cap
    const str = this.TEMPLATES["Recommendations"](this.api);
    $(".list-all-recommendations").html(str);
  }

  handleCopyFormula() {
    $("body").on("click", ".advice-debug .cpy", e => {
      e.preventDefault();
      const $el = $(e.currentTarget);
      const txt = $el.text();
      copy(txt);
    });
  }

  /**
   * Change the highlighted assumption in the list based on
   * active display.
   */
  _setAssumptionActive(isAdvice) {
    const { id } = this.api.display;
    if (isAdvice) {
      $(".assumptions, .answers").find("li").removeClass("active");
    } else {
      $(".assumptions, .answers").find("li").removeClass("active").end().find(`li[data-id=${id}]`).addClass("active");
    }
  }

  /**
   * Update advice debug sidebar
   */
  updateAdviceDebugSidebar() {
    // render
    this.api.formulaDebug = _.compact((this.api.formulaDebug || []).map(f => {
      const varLookup = this.api.variables.find(v => { return f.id == v.id });
      if (f.name.toLowerCase().endsWith("_txt")) {
        return null;
      }
      if (f.expression == "1" || f.expression == "0" || f.name.startsWith("IRS")) {
        // console.log(f)
        f._hide_result = true;
        f.expression = "";
        // f.result_formatted = f.expressionDebug;
      }
      if (varLookup) {
        f.result_formatted = f.result;
        if (varLookup.format) {
          f.result_formatted = numeral(f.result).format(varLookup.format);
        }
      }
      return f;
    }));

    // eslint-disable-next-line new-cap
    const str = this.TEMPLATES["AdviceDebugSidebar"](this.api);
    $(".advice-debug").html(str);
  }

  updateSaveGoalButton() {
    const profile = window.jga.UserProfile?.savedProfile;
    if (profile) {
      const goalExists = store.get("frb_user_goals_" + profile._name);
      if (goalExists && goalExists.length) {
        const { controller: controllerName } = $("body").find("div[data-controller]").data();
        const actualGoalExists = goalExists.find(g => { return g.controllerName == controllerName });
        if (actualGoalExists) {
          $(".advice").find("a[data-action='save-goal']").text("Update Goal");
        }
      }
    }
  }

  /**
   * Update variables list
   */
  updateVariablesList() {
    // add formatted value to Booleans
    this.api.variables = this.api.variables.map(v => {
      if (v.dataType == "Boolean") {
        if (v.value === 1) {
          v.valueFormatted = "Yes";
        } else if (v.value === 0) {
          v.valueFormatted = "No";
        }
      }
      return v;
    });
    // render
    const template = Handlebars.compile($("#tmpl_variablesList").html());
    $("#dataModal .variables").html(template(this.api));
  }

  /**
    * Map variables into named list
    */
  mapVariables() {
    const vars = this.api.variables || [];
    this.api.variables_map = {}
    vars.forEach(v => {
      // sometimes API doesn't return value property
      if (!_.has(v, "value")) {
        v.value = null;
      }
      this.api.variables_map[v.name] = v;
    });
  }

  /**
   * Update inline HTML for taffrail variables
   */
  updateTaffrailVarHtml() {
    // handle taffrail-var
    $("body").find("taffrail-var").each((i, el) => {
      const $el = $(el);
      const { variableId, variableName } = $el.data();
      // find corresponding question
      const question = _.flatMap(this.api.answers).find((a) => {
        // check question rules first, then input requests
        return a.form.questionVariable?.reservedName == variableName || a.form.name == variableName;
      });
      if (question) {
        $el
          .addClass("active")
          .data("idx", question.idx)
          .attr("data-idx", question.idx)
          .attr("data-toggle", "tooltip")
          .attr("title", "Click to change")
        ;
      } else {
        // if not a question, check for raw formula
        if (this.api.formulaDebug) {
          const source = this.api.formulaDebug.find(f => { return f.id == variableId });
          if (!source) { /* console.error("no source found", variableId);*/ return; }
          const isInSidebar = $el.closest(".advice-debug").length;
          if (isInSidebar) { return; }

          const varLookup = this.api.variables.find(v => { return v.id == variableId });
          if (!varLookup) { console.error("no var found", variableId); return; }

          const dictLink = `${this.config.advicebuilder_host}/admin/dictionary?preloadId=${variableId}`;

          const html = `
            <div class="debug-card">
              <div>
                <h5>Variable</h5>
                <div class="d-flex justify-content-between">
                  <div class="text-monospace var-name">
                    <a href="${dictLink}" target="_blank">${varLookup.name}</a>
                  </div>
                  <a href="#formula_${variableId}" class="jumptoformula"><i class="fal fa-sort-amount-down-alt"></i></a>
                </div>
                <div class="expression">
                  <h5>Formula</h5>
                  <div class="d-flex justify-content-between">
                    <code class="exp cpy">${source.expression}</code>
                    <code class="value text-right">= ${source.result}</code>
                  </div>
                </div>

                <div class="exp-debug">
                  <h5>Expression debug</h5>
                  <code class="cpy">${source.expressionDebug}</code>
                </div>
              </div>
            </div>
          `;

          $el
            .addClass("active active--calculated")
            .attr("tabindex", 0)
            .attr("role", "button")
            .popover({
              container: "body",
              placement: "top",
              title: "Inspector",
              content: html,
              html: true,
              trigger: "focus"
            })
            .on("shown.bs.popover", e => {
              $(".popover")
                .find(".cpy")
                .on("click", e => {
                  e.preventDefault();
                  const $el = $(e.currentTarget);
                  copy($el.text()).then(() => {
                    $el.tooltip("dispose");
                  });
                })
                .tooltip({ title: "Click to copy" })
              ;
              $(".popover")
                .find("a.jumptoformula")
                .on("click", e => {
                  e.preventDefault();
                  const $el = $(e.currentTarget);
                  $el.tooltip("dispose");
                  const link = $el.attr("href");
                  $("html, body").animate({ scrollTop: $(`${link}`).offset().top - 50 }, 400, () => {
                    $(`${link}`).addClass("flash");
                  });
                })
                .tooltip({ title: "Jump to formula" })
              ;
            })
          ;
        }
      }
    });
  }

  /**
   * Set an index on the `display` to allow navigating assumptions list
   */
  _setCurrentIdx() {
    // set the current index based on answers
    // only useful for going "back"
    let currIdx = _.findIndex(this.api.answers, (ans) => { return this.api.display.id == ans.id });
    if (currIdx == -1) {
      currIdx = this.api.answers.length;
    }
    this.api.display._currIdx = currIdx;
    this.api.display._isFirst = currIdx === 0;
  }

  // #endregion
  /**
 * "Next" button handler
 */
  handleClickContinue() {
    // pressing radio button auto-advances to next
    this.$advice.on("click", ".form-check label.form-check-label", e => {
      const $lbl = $(e.currentTarget);
      $lbl.prev("input").prop("checked", true);
      const $form = $lbl.closest("form");
      $form.trigger("submit");
    });

    this.$advice.on("submit", "form", e => {
      const $form = $(e.currentTarget);

      // this._scrollTop();

      // convert values from masked to unmasked for form submission
      const $inputs = this._findFormInput($form);
      $inputs.each((i, el) => {
        const $input = $(el);
        const { inputmask } = $input.data();

        if (inputmask) {
          const unmaskedval = inputmask.unmaskedvalue();
          inputmask.remove();
          $input.val(unmaskedval);
        }

        // while we're here, convert percent to precision value
        if ($input.is("input[data-type=Percent]")) {
          $input.val($input.val() / 100);
        }
      });

      const data = $form.serialize();

      // push answer to this question into saved user profile
      if (window.jga.UserProfile) {
        window.jga.UserProfile.buildProfileWith(qs.parse(data));
      }

      this.load(data, this.$advice, false).then(api => {
        // update content
        this.updateFn(api);
        this.updatePanes();
      });

      return false; // don't submit form
    });
  }

  /**
   * "Back" button handler
   */
  handleClickBack() {
    this.$advice.on("click", "a[data-action=back]", e => {
      e.preventDefault();
      const { _currIdx } = this.api.display;
      const display = this.api.answers.find((a) => { return a.idx == _currIdx - 1; });
      if (!display) { return; }
      // this._scrollTop();
      // temp override `display` global prop to insert question into HTML
      this.api.display = display;
      // update content
      this.updateMainPane();
    });
  }

  /**
 * Click handler for assumptions or Q&A
 */
  handleClickAssumption() {
    $(".assumptions-outer-container").on("click", ".a > a, a.statement", e => {
      e.preventDefault();
      const $this = $(e.currentTarget);
      const data = $this.closest("li").data();
      const { idx } = data;
      // $("html, body").animate({ scrollTop: this.scrollTo });
      // temp override `display` global prop to insert question into HTML
      // when user presses "OK" to keep or change answer, global data is refreshed/restored
      const answer = _.flatMap(this.api.assumptions).find((a) => { return a.idx == idx; });
      this.api.display = answer;
      this.api.display.idx = answer.idx;
      this.updateMainPane();
    });
  }

  /**
   * click taffrail var
   */
  handleClickTaffrailVar() {
    $(document).on("click", "taffrail-var.active", e => {
      e.preventDefault();
      const $this = $(e.currentTarget);
      $this.tooltip("hide");
      const isCalculated = $this.hasClass("active--calculated");
      if (isCalculated) {
        return;
      }
      const { idx } = $this.data();
      // temp override `display` global prop to insert question into HTML
      // when user presses "OK" to keep or change answer, global data is refreshed/restored
      if (this.api?.answers) {
        const answer = _.flatMap(this.api.answers).find((a) => { return a.idx == idx; });
        this.api.display = answer;
        this.api.display.idx = answer.idx;
        this.updateMainPane();
      }
    });
  }

  /**
   * Listener for opening/closing advice summaries
   */
  handleCollapseAdviceSummaries() {
    $(".list-all-recommendations").on("show.bs.collapse", ".collapse", (e) => {
      const $this = $(e.currentTarget);
      const $toggler = $(`a[aria-controls=${$this.prop("id")}]`);
      const isGroupHeader = $toggler.hasClass("group-toggler") && $toggler.find("i").length;
      if (isGroupHeader) {
        $toggler.find("i").addClass("fa-chevron-down").removeClass("fa-chevron-right");
      } else {
        $toggler.find("i").addClass("fa-chevron-down").removeClass("fa-chevron-right");
      }
    });

    $(".list-all-recommendations").on("hidden.bs.collapse", ".collapse", (e) => {
      const $this = $(e.currentTarget);
      const $toggler = $(`a[aria-controls=${$this.prop("id")}]`);
      const isGroupHeader = $toggler.hasClass("group-toggler");
      if (isGroupHeader) {
        $toggler.find("i").addClass("fa-chevron-right").removeClass("fa-chevron-down");
      } else {
        $toggler.find("i").addClass("fa-chevron-right").removeClass("fa-chevron-down");
      }
    });
  }

  /**
   * Listener for opening/closing assumption groups
   */
  handleCollapseAssumptionGroup() {
    $(".assumptions").on("show.bs.collapse", "ol.assumptions-list.collapse", (e) => {
      const $this = $(e.currentTarget);
      const { groupId } = $this.find("li").first().data();
      store.set(`assumption_${groupId}_${this.api.adviceset.id}`, true);
      const $toggler = $(`a[aria-controls=${$this.prop("id")}]`);
      $toggler.find("i").addClass("fa-chevron-down").removeClass("fa-chevron-right");
    });

    $(".assumptions").on("hidden.bs.collapse", "ol.assumptions-list.collapse", (e) => {
      const $this = $(e.currentTarget);
      const { groupId } = $this.find("li").first().data();
      store.set(`assumption_${groupId}_${this.api.adviceset.id}`, false);
      const $toggler = $(`a[aria-controls=${$this.prop("id")}]`);
      $toggler.find("i").removeClass("fa-chevron-down").addClass("fa-chevron-right");
    });
  }

  /**
   * Handle clicks to open variable modal
   */
  handleClickOpenRawDataModal() {
    $("main").on("click", "a[data-action='modal-raw-data']", e => {
      e.preventDefault();
      $("#dataModal").modal();
    });
  }

  /**
   * Handle click to generate and copy a short URL
   */
  handleCopyLink() {
    $("body").on("click", "a.copy-url", e => {
      e.preventDefault();
      const linkGenId = _.uniqueId("link-gen");
      const url = window.location.href;

      // hit the shorten API
      const { display } = this.api;
      const title = display.type == "INPUT_REQUEST" ? display.question : display.headline;

      new Promise((resolve, reject) => {
        // we can't shorten localhost links
        if (url.includes("localhost")) {
          return resolve({ link: url });
        } else {
          return $.post("/api/shorten", {
            long_url: url,
            title: `${this.api.adviceset.title} - ${title}`
          }).then(resolve);
        }
      }).then(bitly => {
        // copy to clipboard
        return copy(bitly.link).then(() => {
          this.showToast(linkGenId, {
            title: "Taffrail",
            message: "Link copied!"
          });
        });
      }).catch(e => {
        console.error(e);
        this.showToast(linkGenId, {
          title: "Oops",
          message: "Link copying error."
        });
      })
    });
  }

  /**
   * Handle clicks to toggle advice editing mode
   */
  handleClickToggleAdviceEditorMode() {
    $("main").on("click", "a[data-action='toggle-edit-advice-mode']", e => {
      e.preventDefault();
      const currentlyEnabled = this.adviceEditorModeEnabled;
      const modeEnabled = !currentlyEnabled ? true : false;
      store.set("adviceEditorModeEnabled", modeEnabled);
      this.adviceEditorModeEnabled = modeEnabled;
      $("html").toggleClass("advice-editor-mode-enabled", modeEnabled);
    });
  }

  /**
   * Set the active audience in the switcher
   */
  setActiveAudience(audienceId = -1) {
    const $switcher = $(".audience-switcher");
    const $audItem = $(`a[data-audience-id=${audienceId}]`);
    this.api.audienceType = {
      id: audienceId,
      name: $audItem.text() || "Default"
    }
    $audItem.addClass("active").siblings().removeClass("active");
    $switcher.find("span.active-voice").text(`${this.api.audienceType.name} Voice`);
  }

  /**
   * Handle changes in audience type
   */
  handleChangeAudience() {
    $("main").on("click", "a[data-action=set-audience]", e => {
      const $el = $(e.currentTarget);
      const { audienceId = -1 } = $el.data();
      this.load(`audienceId=${audienceId}`, undefined, false).then(() => {
        this.updateFn && this.updateFn();
      });
    });
  }

  /**
   *
   * @param {string=} id Optional ID
   * @param {object} opts Toast options
   * @param {string} opts.title Toast title
   * @param {string=} opts.message Toast message
   * @param {number=} opts.delay Toast delay, default to 2 seconds
   */
  showToast(id = _.uniqueId("toast"), opts = {}) {
    if (!opts.id) {
      opts.id = id;
    }
    const toast = Handlebars.compile($("#tmpl_toast").html())(opts);
    // insert into DOM
    $("#toastWrapper").show();
    $("#toastContainer").append(toast);
    // init Toast component
    $(`#${id}`).toast({
      delay: opts.delay || 2000
    }).on("hidden.bs.toast", function() {
      $(this).remove(); // remove it when it's been hidden
      $("#toastWrapper").hide();
    }).toast("show"); // finally show it
  }

  // #region form utils
  /**
   * Set the form value from the API data
   */
  _setValue($container = this.$advice) {
    const { display: { form: { fieldType } } } = this.api;
    let { display: { value } } = this.api;

    // if there is no value, don't continue
    if (value == undefined || value == "\"null\"") { return; }

    const $formEls = $container.find("form").find("input,select");
    $formEls.each((i, el) => {
      const $el = $(el);
      if ($el.is(":radio")) {

        // for Bools, we need to stringify `true` and `false` to check the radio button
        if (fieldType == "Boolean") {
          value = String(value);
        }

        if ($el.prop("value") == value || $el.prop("value") == "\"" + value + "\"") {
          $el.prop("checked", true)
        }
      } else {
        // precision-to-display
        if (fieldType == "Percent") {
          value = value * 100;
        }
        $el.val(value);
      }
    });
  }

  /**
   * Setup form input masks based on type
   * https://github.com/RobinHerbots/Inputmask#mask
   */
  // eslint-disable-next-line complexity
  _handleInputMasks($container = this.$advice) {
    const $inputEl = this._findFormInput($container.find("form"));
    if ($inputEl.length) {
      const maskOpts = {
        showMaskOnHover: false
      };
      const { fieldType, properties } = this.api.display.form;
      const { range = {} } = properties;
      let { format: formatStr = "" } = properties;

      // if min & max attrs are present, pass them to the mask
      const { min, max } = range;
      if (min !== "undefined") {
        $inputEl.prop("min", min);
        maskOpts.min = min;
      }
      if (max !== "undefined") {
        $inputEl.prop("max", max);
        maskOpts.max = max;
      }

      // coerce to string for conditional test below
      formatStr = String(formatStr);

      // https://github.com/RobinHerbots/Inputmask/blob/4.x/README_numeric.md#aliases
      // https://github.com/RobinHerbots/Inputmask/blob/5.x/lib/extensions/inputmask.numeric.extensions.js#L442
      switch (fieldType) {
        case "Number":
          maskOpts.alias = "numeric";
          maskOpts.showMaskOnFocus = false;

          // check format to see if we need a different mask
          if (formatStr.includes("$")) {
            maskOpts.alias = "currency";
            maskOpts.digitsOptional = true;
            maskOpts.prefix = "$ ";
            maskOpts.showMaskOnFocus = true;
          }
          break;
        case "Percent":
          maskOpts.alias = "percentage";
          // Get the number of decimal points if decimal is present
          if (formatStr.indexOf(".") != -1) {
            maskOpts.digits = formatStr.indexOf("%") - formatStr.indexOf(".") - 1;
          }
          break;
        case "Date":
          maskOpts.alias = "datetime";
          break;
      }

      if (maskOpts.mask || maskOpts.alias) {
        const im = new Inputmask(maskOpts).mask($inputEl.get(0));
        $inputEl.data("inputmask", im);
      }
    }
  }

  /**
   * Focus the 1st visible input on the question form for quicker UX.
   */
  _focusFirstInput($container = this.$advice) {
    // focus 1st input
    this._findFormInput($container.find("form"), "input,textarea,select").first().focus();
  }

  /**
   * Find input element
   * @param {jquery} $form Form element
   * @param {string=} types Comma-separated list of HTML tags, e.g., "input,select"
   */
  _findFormInput($form, types = "input") {
    return $form.find(types).filter(":not(:radio):not(:hidden)");
  }

  /**
   * Helper to build taffrail-var HTML
   * @param {} variable
   * @param {*} content
   * @returns
   */
  tfvar(variable, content) {
    if (!content) { content = variable?.valueFormatted || variable.value; }
    return `<taffrail-var 
      data-variable-name="${variable.name}" 
      data-variable-id="${variable.id}" 
      tabindex=0
      data-format="${variable.format}"
      data-raw-value="${variable.value}">
        ${content}</taffrail-var>`
  }
  // #endregion
}
