import _ from "lodash";
// import copy from "clipboard-copy";
// import { createBrowserHistory } from "history";
import Handlebars from "handlebars";
import Inputmask from "inputmask";
import Loading from "../loading";
import qs from "querystring";
import store from "store";
import isHtml from "is-html";

export default class TaffrailApi {
  constructor(){
    // this.history = createBrowserHistory();

    // handlebars helpers
    Handlebars.registerHelper("ifEquals", function(arg1, arg2, options) {
      return (arg1=== arg2) ? options.fn(this) : options.inverse(this);
    });

    Handlebars.registerHelper("ifNotEquals", function(arg1, arg2, options) {
      return (arg1 != arg2) ? options.fn(this) : options.inverse(this);
    });

    Handlebars.registerHelper("breaklines", (text) => {
      if (text && !text.includes("<taffrail-var") && !isHtml(text)) {
        text = Handlebars.Utils.escapeExpression(text);
      }
      text = text.replace(/(\r\n|\n|\r)/gm, "<br>");
      return new Handlebars.SafeString(text);
    });

    Handlebars.registerHelper("toString", (x) => {
      return (x === void 0) ? "undefined" : String(x);
    });
  }

  /**
   * Initialize
   */
  init(){
    if (!this.api?.adviceset) {
      // console.info("AdviceSetId not present on DOM, reloading...");
      window.location.reload();
    }

    // set the base URL for loading data
    window.jga.api._links = { self: `${this.config.api_host}/api/advice/${this.api.adviceset.id}` }
    // helpers
    $("body").tooltip({ selector: "[data-toggle=tooltip]" });
    // events
    this.initCache();
    this.handleClickContinue();
    this.handleClickTipTakeAction();
    this.handleClickBack();
    this.handleClickSheet();
    this.handleClickAssumption();
    this.handleClickTaffrailVar();
    this.handleCollapseAssumptionGroup();
    this.handleChangeAudience();
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
    const prefix = "s";
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
   * Capture new form data, merge with current state and make new Advice API request.
   * @param {object} newFormData Form data from input request.
   * @param {jQuery} $loadingContainer
   * @param {boolean} usePlaceholder
   * @returns Promise<jqXHR>
   */
  load(newFormData, $loadingContainer = this.$loadingContainer, usePlaceholder = true){
    const currFormData = this.api.params;
    const userProfileData = window.jga.UserProfile ? _.omit(window.jga.UserProfile.savedProfile, "_name") : {};
    const formData = _.assign(
      {
        include: ["filteredVars"],
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
   * Slight speed update to cache frequently-used templates and selectors
   */
  initCache() {
    // cache element selectors
    this.$advice = $(".phone .advice");
    // cache templates
    this.TEMPLATES = {
      "InputRequest": Handlebars.compile($("#tmpl_adviceInputRequest").html()),
      "Recommendations": Handlebars.compile($("#tmpl_groupedRecommendationsAdviceList").html()),
      "Assumptions": Handlebars.compile($("#tmpl_assumptionsList").html()),
      "Error": Handlebars.compile($("#tmpl_error").html()),
    };
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

    // go through each assumption group and set open/close state
    Object.keys(this.api.assumptions).forEach((key, idx) => {
      // add `_isOpen` flag to each item
      const arr = this.api.assumptions[key];
      this.api.assumptions[key] = arr.map(a => {
        if (key == ASSUMPTIONS_UNGROUPED){
          a.tagGroup = {
            id: "ag",
            name: ASSUMPTIONS_UNGROUPED
          }
        }
        a._isOpen = store.get(`assumption_${a.tagGroup.id}_${this.api.adviceset.id}`, false);
        return a;
      });
    });

    this.mapAdviceData();
  }

  /**
   * Helper to find the "last" Advice node, including a check for the
   * System Advice Node with special ID -32768
   */
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

    // all advice to render is saved to `recommendations`
    this.api.recommendations = groupedAdvice;

    this.mapVariables();
  }

  /**
   * Map variables into named list
   */
  mapVariables() {
    const vars = this.api.variables||[];
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
   * Map reference doc data
   */
  mapReferenceDocuments() {
    let hasMoreThanLimit = false;
    this.api.adviceset.referenceDocuments = this.api.adviceset.referenceDocuments.map((rd, i) => {
      const { _links: { original = "" } } = rd;
      if (original && original != "null") {
        const u = new URL(original);
        rd._links.original_without_prefix = `${u.host.replace("www.","")}${u.pathname}`;
      }
      // show only first 6 docs
      rd._hidden = (i >= 6);
      hasMoreThanLimit = (i >= 6);
      return rd;
    });

    this.api.adviceset.referenceDocuments_hasMoreThanLimit = hasMoreThanLimit;

    this.api.adviceset.referenceDocuments = this.api.adviceset.referenceDocuments.reverse();
  }

  /**
   *
   */
  updatePanes() {
    // update the window title
    this.windowTitle = `${this.api.adviceset.title} - ${this.api.adviceset.owner.name}`;

    this._setCurrentIdx();
    this.updateVariablesList();
    this.updateSaveGoalButton();

    // handle taffrail-var
    this.$advice.find("taffrail-var").each((i, el) => {
      const $el = $(el);
      const { variableName } = $el.data();
      // find corresponding question
      const question = _.flatMap(this.api.assumptions).find((a) => {
        // check question rules first, then input requests
        return a.form.questionVariable?.reservedName == variableName || a.form.name == variableName;
      });
      if (question) {
        $el
          .addClass("active")
          .data("idx", question.idx)
          .attr("data-idx", question.idx)
          .attr("data-toggle", "tooltip")
          .attr("title", "Tap to change")
        ;
      }
    });

    $("#showcase_url").prop("href", `/s/${this.api.adviceset.id}/?${this.api.paramsAsQueryStr}`).prop("target","_blank");
  }

  /**
   * Template update for INPUT_REQUEST
   */
  updateForInputRequest($container = this.$advice) {
    // hide goal pane
    $(".goal-result").hide();
    // render
    // eslint-disable-next-line new-cap
    const str = this.TEMPLATES["InputRequest"](this.api);
    $container.html(str);

    // hide "next" button unless it's a numeric input
    const isRadio = this.api.display.form.fieldType.match(/Radio|Boolean/);
    $container.find("button[type=submit]").toggle(!(isRadio && isRadio.length > 0));

    // set value
    this._setValue($container);
    // // set input masks
    this._handleInputMasks($container);
    // // focus input
    this._focusFirstInput($container);
  }

  /**
   * Update advice list by group
   */
  updateForAdvice($container = this.$advice) {
    // simple helper for UX
    this.api._recommendationsExist = _.flatMap(this.api.recommendations).length > 0;

    // render
    // eslint-disable-next-line new-cap
    const str = this.TEMPLATES["Recommendations"](this.api);
    $container.html(str);

    // this._setupChartsAll();
  }

  /**
   * Update assumptions/answers/history list
   */
  updateAssumptionsList() {
    // do we have ANY assumptions/answers yet?
    // show or hide depending
    // simple helper for UX
    this.api._answersExist = this.api.answers.length > 0;

    // PERSONAL PROFILE
    // map user data into new group
    const savedProf = window.jga.UserProfile?.savedProfile;
    if (savedProf) {
      // let Taffrail API assume super power over any variables in user profile AND advice variables
      const answerVariables = this.api.answers.map(a => { return a.form.name });
      // blacklist any user profile vars present in advice vars
      const blacklist = ["_name"].concat(answerVariables);
      let personalProfile = Object.keys(savedProf).map(k => {
        if (blacklist.includes(k) || k.startsWith("rule_") || k.startsWith("Fit_")) { return null; }

        // map an object to match the templating interface
        return {
          id: _.uniqueId(`${k}_`),
          tagGroup: {
            id: "pp"
          },
          form: {
            questionVariable: {
              name: k
            }
          },
          answer: savedProf[k] || ""
        }
      });

      personalProfile = _.compact(personalProfile);
      this.api.assumptions["Client Profile"] = _.sortBy(personalProfile, o => { return o.form.questionVariable.name; });
    }

    // render
    // eslint-disable-next-line new-cap
    const strAssump = this.TEMPLATES["Assumptions"](this.api);
    $("#assumptions").html(strAssump);
  }

  /**
   * Get variable object by name
   * @param {string} name Variable name
   */
  var(name) {
    return _.find(this.api.variables, { name });
  }

  /**
	 * Update variables list
	 */
  updateVariablesList(){
    // render
    const template = Handlebars.compile($("#tmpl_variablesList").html());
    $("#dataModal .variables").html(template(this.api));
  }

  updateSaveGoalButton(){
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
   * Click handler for taking action in goal footer
   */
  handleClickTipTakeAction() {
    $(".advice").on("click", "a.tip-take-action", e => {
      e.preventDefault();
      const $this = $(e.currentTarget);
      const { action } = $this.data();
      this.load(action, $("main.screen"), false).then(api => {
        // update content
        this.updateFn(api);
        this.updatePanes();
        $(document).trigger("pushnotification", ["goal_change", { message: "Great! Your goal was updated" }]);
      });
    });
  }

  /**
   * Click handler for assumptions or Q&A
   */
  handleClickAssumption() {
    $("#assumptions").on("click", ".a > a, a.statement", e => {
      e.preventDefault();
      const $this = $(e.currentTarget);
      const data = $this.closest("li").data();
      const { idx, groupId } = data;
      // do not allow changes to "personal profile" data
      if (groupId == "pp") {
        return;
      }
      // $("html, body").animate({ scrollTop: this.scrollTo });
      // temp override `display` global prop to insert question into HTML
      // when user presses "OK" to keep or change answer, global data is refreshed/restored
      const answer = _.flatMap(this.api.assumptions).find((a) => { return a.idx == idx; });
      this.api.display = answer;
      this.api.display.idx = answer.idx;
      this.updateForInputRequest();
      this.triggerClickSheet(); // close
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
      const { idx } = $this.data();
      // temp override `display` global prop to insert question into HTML
      // when user presses "OK" to keep or change answer, global data is refreshed/restored
      const answer = _.flatMap(this.api.assumptions).find((a) => { return a.idx == idx; });
      this.api.display = answer;
      this.api.display.idx = answer.idx;
      this.updateForInputRequest();
    });
  }

  /**
   * Open/close a sheet
   */
  handleClickSheet() {
    $(".phone").on("click", "a[data-sheet]", e => {
      e.preventDefault();
      const $el = $(e.currentTarget);
      const { sheet } = $el.data();

      if (sheet == "drawer") {
        $("#drawer").toggleClass("show");
        $(".phone").toggleClass("drawer-open");
        // 300ms CSS animation
        setTimeout(()=>{
          $("#drawer").toggleClass("shown");
        }, 100);
      }
    });
  }

  triggerClickSheet(){
    $(".phone").find("a[data-sheet]").trigger("click");
  }

  /**
   * Listener for opening/closing assumption groups
   */
  handleCollapseAssumptionGroup() {
    $("#assumptions").on("show.bs.collapse", "ol.assumptions-list.collapse", (e) => {
      const $this = $(e.currentTarget);
      const { groupId } = $this.find("li").first().data();
      store.set(`assumption_${groupId}_${this.api.adviceset.id}`, true);
      const $toggler = $(`a[aria-controls=${$this.prop("id")}]`);
      $toggler.find("i").addClass("fa-chevron-down").removeClass("fa-chevron-right");
    });

    $("#assumptions").on("hidden.bs.collapse", "ol.assumptions-list.collapse", (e) => {
      const $this = $(e.currentTarget);
      const { groupId } = $this.find("li").first().data();
      store.set(`assumption_${groupId}_${this.api.adviceset.id}`, false);
      const $toggler = $(`a[aria-controls=${$this.prop("id")}]`);
      $toggler.find("i").removeClass("fa-chevron-down").addClass("fa-chevron-right");
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

  // /**
  //  * Listen on the browser history for POP actions to update the page.
  //  */
  // listenForUrlChanges() {
  //   this.history.listen((location, action) => {
  //     if (action === "POP" && location.state) {
  //       this.api = location.state;
  //       this.updatePanes();
  //     }
  //   });
  // }

  /**
   * "Next" button handler
   */
  handleClickContinue() {
    // pressing radio button auto-advances to next
    $(".screen").on("click", ".form-check label.form-check-label", e => {
      const $lbl = $(e.currentTarget);
      $lbl.prev("input").prop("checked", true);
      const $form = $lbl.closest("form");
      $form.trigger("submit");
    });

    $(".screen").on("submit", "form", e => {
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

      this.load(data, $("main.screen"), false).then(api => {
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
      // const { _currIdx } = this.api.display;
      // const display = this.api.answers.find((a) => { return a.idx == _currIdx - 1; });
      // if (!display) { return; }
      // this._scrollTop();
      // // temp override `display` global prop to insert question into HTML
      // this.api.display = display;
      // this.updateMainPane();
      alert("back!");
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
   * Handle clicks to toggle primnary advice mode
   */
  handleClickShowAllSources() {
    $("main").on("click", "a[data-action='showAllSources']", e => {
      e.preventDefault();
      const $btn = $(e.currentTarget);
      $btn.hide()
      $("#group_references").find(".card.d-none").removeClass("d-none");
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

  // #region form utils
  /**
	 * Set the form value from the API data
	 */
  _setValue($container = this.$advice) {
    const { display: { form: { fieldType } } } = this.api;
    let { display: { value } } = this.api;
    if (!value || value == "\"null\"") { return; }

    const $formEls = $container.find("form").find("input,select");
    $formEls.each((i, el) => {
      const $el = $(el);
      if ($el.is(":radio")) {
        if ($el.prop("value") == value || $el.prop("value") == "\""+value+"\"") {
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
  _handleInputMasks($container = this.$advice){
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
          if (formatStr.indexOf(".") != -1){
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
  // #endregion
}
