import _ from "lodash";
import copy from "clipboard-copy";
import { createBrowserHistory } from "history";
import Handlebars from "handlebars";
import Inputmask from "inputmask";
import Loading from "./loading";
import marked from "marked";
import promiseRetry from "promise-retry";
import qs from "querystring";
import store from "store";
import isHtml from "is-html";
const HTTP_TIMEOUT = 29000;
export default class ShowcasePage {
  constructor(){

    // https://marked.js.org/using_advanced#options
    marked.setOptions({
      gfm: true,
      breaks: false,
    });

    this.history = createBrowserHistory();

    // handlebars helpers
    Handlebars.registerHelper("ifEquals", function(arg1, arg2, options) {
      return (arg1=== arg2) ? options.fn(this) : options.inverse(this);
    });

    Handlebars.registerHelper("ifNotEquals", function(arg1, arg2, options) {
      return (arg1 != arg2) ? options.fn(this) : options.inverse(this);
    });

    Handlebars.registerHelper("breaklines", (text) => {
      return text;

      if (text && !text.includes("<taffrail-var") && !isHtml(text)) {
        text = Handlebars.Utils.escapeExpression(text);
      }
      text = String(_.trim(text)).replace(/(\r\n|\n|\r)/gm, "<br>");

      // in a markdown scenario with lists, we end up with too many <br> tags in weird places
      text = text.replace(/<br><ul>/g, "<ul>");
      text = text.replace(/<br><li>/g, "<li>");
      text = text.replace(/<\/li><br><li>/g, "</li><li>");
      text = text.replace(/<\/li><br><ul>/g, "</li><ul>");
      text = text.replace(/<\/li><br><\/ul>/g, "</li></ul>");

      return new Handlebars.SafeString(text);
    });

    Handlebars.registerHelper("toString", (x) => {
      return (x === void 0) ? "undefined" : String(x);
    });
  }

  /**
   * Page onload, one time
   */
  init(){
    // set the base URL for loading data
    window.jga.api._links = { self: `${this.config.api_host}/api/advice/${this.api.adviceset.id}` }
    // helpers
    if (bootstrap.Tooltip) {
      // v5
      new bootstrap.Tooltip(document.body, {
        selector: "[data-toggle=tooltip]",
        html: true,
        delay: 250
      });
    } else {
      $("body").tooltip({ selector: "[data-toggle=tooltip]", html: true });
    }
    // mode
    this.adviceEditorModeEnabled = store.get("adviceEditorModeEnabled", true);
    if (this.adviceEditorModeEnabled) {
      $("html").addClass("advice-editor-mode-enabled");
    }
    // events
    this.handleChangeApiChannel();
    this.handleChangeAudience();
    this.handleCopyLink();
    this.handleCopyLinkAndSaveScenario();
    this.handleClickOpenRawDataModal();
    this.handleClickToggleAdviceEditorMode();
    this.handleClickShowAllSources();

    // inside iframe? screenshot generator helper
    const isFramed = window.location !== window.parent.location;
    if (isFramed && window.location.pathname.includes("cleanshot")) {
      $("body").addClass("showcase--redux_isFramed");
      $("main.container").removeClass("container").addClass("container-fluid");
    } else if (isFramed) {
      $("body").addClass("showcase-iframed");
    }
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

  get viewName() {
    const path = _.last(location.pathname.split("/"));
    const views = ["mobile","salesforce","chatbot"];
    if (views.includes(path)) {
      return path; // no preceding `/`
    }
    return "";
  }

  // these are API params set by default
  // do not save them as visible parts of the URL or in Advice Builder scenarios
  get paramsToOmit() {
    return ["include", "showcase", "returnFields"];
  }

  // eslint-disable-next-line accessor-pairs
  set windowTitle(title) {
    document.title = title;
    try {
      window.parent.document.title = title;
    } catch (e) {
      // nothing to do
    }
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
  _loadApi(newFormData = "", $loadingContainer = this.$loadingContainer, usePlaceholder = true){
    const currFormData = this.api.params;
    const include = ["filteredVars"];
    if (location.href.includes("harness")) {
      include.push("formulaDebug");
    }
    const formData = _.assign({
      include: include,
      showcase: true
    }, currFormData, qs.parse(newFormData));
    // internal JGA: don't include these fields
    delete formData.returnFields;

    // get user preference for API channel selection
    this.config.api_channel = store.get("api_channel", "published");

    // is this rule published?
    // if so, switch, by default, to the published channel
    const { publishing: { publishedVersion } = {} } = this.api.adviceset;
    if (this.config.api_channel == "published" && publishedVersion !== null && this.api?._links?.self) {
      this.api._links.self = this.api._links.self.replace(this.config.api_host, this.config.api_engine_host);
    } else {
      this.config.api_channel = "preview";
    }

    const [apiUrlWithoutQuerystring] = this.api._links.self.split("?");
    const loadingId = Loading.show($loadingContainer, undefined, usePlaceholder);

    // pass Handlebars into the AjaxLoading static class
    Loading.Handlebars = Handlebars;
    // setup intervals for when to change long loading messages
    const intervals = [5]; // after 6 seconds, assume preview API is not cached
    const factor = 15;
    for (let i = 1; (factor * i) < 75; i++) {
      intervals.push(factor * i);
    }
    intervals.push(75);

    // start timing API request
    let apiTimer = 0;
    const apiTimingInterval = setInterval(() => {
      apiTimer += 1;
      $("#__loading__").find("span[data-api-timer]").text(apiTimer);

      // at each interval, update the long loading message
      if (intervals.includes(apiTimer)) {
        Loading.showLong($loadingContainer, loadingId, apiTimer, this.api);
      } else if (apiTimer == 75) {
        window.clearInterval(apiTimingInterval);
        $("#__loading__").find(".spinner").hide();
      }
    }, 1000);

    // https://www.npmjs.com/package/promise-retry#usage
    const retryOpts = { minTimeout: HTTP_TIMEOUT / 2, retries: 2 };

    return promiseRetry(retryOpts, (retry, attemptNumber) => {
      return $.ajax({
        url: apiUrlWithoutQuerystring,
        timeout: HTTP_TIMEOUT, // API server max len
        type: "GET",
        dataType: "json",
        headers: {
          "Accept": "application/json; chartset=utf-8",
          "Authorization": `Bearer ${this.config.api_key}`
        },
        contentType: "application/json",
        data: formData
      }).then(api => {
        window.clearInterval(apiTimingInterval);
        // Advice API (preview mode) can return HTTP 200 (success)
        // with an error, so we'll inject that error into the `adviceset`
        // place, so the error shows up on top.
        if (api.error) {
          Loading.hide(loadingId, "all");
          return Promise.reject(new Error(api.error.message));
        }
        // update global!
        this.api = api.data;
        this.api.adviceset = _.extend(this.config?.adviceset, api.data.adviceset);
        this.setActiveAudience(formData.audienceId);
        this.setActiveApiChannel();
        Loading.hide(loadingId, "all");
        return api;
      }).catch((jqXHR) => {
        if (jqXHR.statusText === "timeout") {
          return retry(jqXHR);
        } else {
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
          Loading.hide(loadingId, "all");
          const str = this.TEMPLATES["Error"](this.api);
          this.$advice.html(str);
        }
      });
    });
  }

  /**
   * Helper to find the "last" Advice node, including a check for the
   * System Advice Node with special ID -32768
   */
  // eslint-disable-next-line complexity
  mapAdviceData() {
    // if the `display` is the LAST advice node, set the "isLast" flag
    let allAdvice = this.api.advice.filter(a => { return a.type == "ADVICE"; });

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

    // add markdown-to-html property for `headline` and `summary`
    allAdvice = allAdvice.map(adv => {
      const headline = _.trim(adv.headline_html || adv.headline);
      let headlineMd = marked(headline);
      // remove wrapping <p> tag
      headlineMd = headlineMd.replace(/<p>/g, "").replace(/<\/p>/g, "");
      adv.headline_html = headlineMd;

      const summary = _.trim(adv.summary_html || adv.summary);
      let summaryMd = marked(summary);
      // remove wrapping <p> tag
      summaryMd = summaryMd.replace("<p>", "").replace("</p>", "");
      adv.summary_html = summaryMd;
      return adv;
    });

    // console.info("Grouped advice is " + this.GROUPED_ADVICE_ENABLED);
    let groupedAdvice = {};
    if (this.GROUPED_ADVICE_ENABLED) {
      // group all advice into bucketed recommendations
      groupedAdvice = _.groupBy(allAdvice, (a) => {
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
    } else {
      // go through all advice tagGroups and remove the same back-to-back groups
      let group = "";
      allAdvice.forEach(adv => {
        const currGroup = adv?.tagGroup?.name;
        if (currGroup !== undefined) {
          if (group == currGroup) {
            delete adv.tagGroup;
          }
          group = currGroup;
        }

        // determine if this is an interactive chart attachment
        const { attachment } = adv;
        let isChart = false;
        if (attachment) {
          isChart = attachment.contentType == "application/vnd+interactive.chart+html";
          // handlebars helper
          attachment._isInteractiveChart = isChart;
        }
      });
      this.api.recommendations = allAdvice;
    }

    // add config to api data because handlebars can't access `jga` global
    this.api.config = window.jga.config;

    this.mapVariables();
  }

  /**
   * Remove any assumptions without statements
   */
  filterAssumptionsWithoutStatement(){
    Object.keys(this.api.assumptions).forEach((key, idx) => {
      const arr = this.api.assumptions[key];
      this.api.assumptions[key] = arr.filter(a => {
        return _.has(a, "statement");
      });
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
   * Delete assumption group if no items exist
   */
  deleteEmptyAssumptionGroups() {
    Object.keys(this.api.assumptions).forEach((key, idx) => {
      if (this.api.assumptions[key] && this.api.assumptions[key].length === 0) {
        delete this.api.assumptions[key];
      }
    });
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
   * Map reference doc data
   */
  mapReferenceDocuments() {
    let hasMoreThanLimit = false;
    this.api.adviceset.referenceDocuments = [].concat(this.api.adviceset.referenceDocuments||[]).map((rd, i) => {
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
	 * Update variables list
	 */
  updateVariablesList(){
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
  updateTaffrailVarHtml(addClassNameMark = false) {
    // handle taffrail-var
    $("body").find("taffrail-var").each((i, el) => {
      const $el = $(el);

      if (addClassNameMark) {
        $el.addClass("mark");
      }

      const { variableId, variableName } = $el.data();
      // find corresponding question
      const question = _.flatMap(this.api.answers).find((a) => {
        // check question rules first, then input requests
        return a.form.questionVariable?.reservedName == variableName || a.form.name == variableName;
      });
      if (question) {
        let tooltipLabel;
        if (question?.statement) {
          tooltipLabel = `${question.question}<span class='line2'>${question.statement}</span>`;
        } else {
          tooltipLabel = `${question.question}<span class='line2'>Click to change</span>`;
        }
        $el
          .addClass("active")
          .data("idx", question.idx)
          .attr("data-idx", question.idx)
          .attr("data-toggle", "tooltip")
          .attr("title", tooltipLabel)
        ;
      } else {
        // if not a question, check for raw formula
        if (this.api.formulaDebug) {
          const source = this.api.formulaDebug.find(f => { return f.id == variableId });
          if (!source) { console.error("no source found", variableId); return; }
          const hasSidebar = $("body").find(".advice-debug").length;
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
                  ${hasSidebar?`<a href="#formula_${variableId}" class="jumptoformula"><i class="fal fa-sort-amount-down-alt"></i></a>`:""}
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

          if (addClassNameMark) {
            $el.addClass("mark");
          }

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
              if (hasSidebar){
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
              }
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
   * Listen on the browser history for POP actions to update the page.
   */
  listenForUrlChanges() {
    this.history.listen((location, action) => {
      if (action === "POP" && location.state) {
        this.api = location.state;
        this.updatePanes();
      }
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
   * Handle click to generate and copy a short URL
   */
  handleCopyLinkAndSaveScenario() {
    $("body").on("click", "a.copy-url-with-scenario", e => {
      e.preventDefault();
      const linkGenId = _.uniqueId("link-gen");
      const url = window.location.href;

      // hit the shorten API
      const { display } = this.api;
      const title = display.type == "INPUT_REQUEST" ? display.question : display.headline;
      const summary = display.type == "INPUT_REQUEST" ? display.explanation : display.summary;
      const isEngineResp = display.id == "-32768";

      new Promise((resolve, reject) => {
        // we can't shorten localhost links
        if (url.includes("localhost")) {
          return resolve({ link: url });
        } else {
          return $.post("/api/shorten", {
            long_url: url,
            title: `${this.api.adviceset.title} - ${title}`
          }).then(resolve).catch(reject);
        }
      }).then(bitly => {
        const paramsEntitiesUsed = [];
        let inputParams = { ...this.api.params };
        // internal JGA: don't include these fields for scenarios
        inputParams = _.omit(inputParams, this.paramsToOmit);
        // lookup input param IDs to save with scenario
        Object.keys(inputParams).forEach(key => {
          const variable = this.api.variables.find(v => { return v.name == key; });
          if (variable) {
            paramsEntitiesUsed.push(variable.id);
          }
        });

        // save scenario to advice builder
        return $.ajax({
          url: `${this.config.advicebuilder_host}/api/advicescenario`,
          type: "POST",
          headers: {
            "Accept": "application/json; chartset=utf-8",
            "Authorization": `Bearer ${this.config.api_key}`
          },
          data: {
            ruleSetId: this.api.adviceset._id,
            params: inputParams,
            paramsEntitiesUsed: paramsEntitiesUsed,
            shortUrl: url.includes("localhost") ? null : bitly.link,
            expectedRuleNodeId: isEngineResp ? null : display.id,
            name: isEngineResp ? "Advice Engine Response" : _.truncate(title, { length: 255 }),
            description: isEngineResp ? null : _.truncate(summary, { length: 255 }),
            position: 1,
            verifiedStatus: isEngineResp ? "error": null,
            verifiedAt: isEngineResp ? new Date() : null
          }
        }).then((api) => {
          const { data: scenario } = api;
          const adviceBuilderScenarioUrl = `${this.config.advicebuilder_host}/advicesets/${this.api.adviceset._id}/advicescenarios/${scenario.id}/show`;

          const $modalHtml = $(`
            <div class="modal fade" data-backdrop="static" data-keyboard="false" tabindex="-1" id="link_modal_${linkGenId}">
              <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                  <div class="modal-header">
                    <h5 class="modal-title">All Set!</h5>
                    <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                      <span aria-hidden="true">&times;</span>
                    </button>
                  </div>
                  <div class="modal-body">
                    <p>A <span class="underline-highlight">short link was copied to your clipboard</span> and an Advice Builder scenario was saved.</p>
                    <ul class="fa-ul">
                      <li>
                        <span class="fa-li"><i class="fal fa-arrow-circle-right"></i></span>
                        <a href="${adviceBuilderScenarioUrl}" target="_blank">Advice Builder Scenario</a>
                      </li>
                      <li>
                        <span class="fa-li"><i class="fal fa-arrow-circle-right"></i></span>
                        <a href="${bitly.link}" target="_blank">${bitly.link}</a>
                      </li>
                    </ul>
                  </div>
                  <div class="modal-footer">
                    <button type="button" class="btn btn-primary" data-dismiss="modal">Close</button>
                  </div>
                </div>
              </div>
            </div>
          `);

          $("body").append($modalHtml);
          $(`#link_modal_${linkGenId}`).modal().on("hidden.bs.modal", e=> {
            $(`#link_modal_${linkGenId}`).remove();
          });

          // copy to clipboard
          return copy(bitly.link).then(() => {
            this.showToast(linkGenId, {
              title: "Taffrail",
              message: "Link copied!"
            });
          });
        })
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
   * Handle clicks to open variable modal
   */
  handleClickOpenRawDataModal() {
    $("main").on("click", "a[data-action='modal-raw-data']", e => {
      e.preventDefault();
      $("#dataModal").modal();
    });
  }

  /**
   * Handle clicks to toggle advice editing mode
   */
  handleClickToggleAdviceEditorMode() {
    $(document).on("click", "a[data-action='toggle-edit-advice-mode']", e => {
      e.preventDefault();
      const currentlyEnabled = this.adviceEditorModeEnabled;
      const modeEnabled = !currentlyEnabled ? true : false;
      store.set("adviceEditorModeEnabled", modeEnabled);
      this.adviceEditorModeEnabled = modeEnabled;
      $("html").toggleClass("advice-editor-mode-enabled", modeEnabled);
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
   * Set the active channel in the switcher
   */
  setActiveApiChannel(channel = this.config.api_channel) {
    const $switcher = $(".channel-switcher");
    const $channelItems = $switcher.find(`a[data-channel=${channel}]`);

    this.config.api_channel = channel;

    // add version # to end of string
    let version = "";
    let hasPublishedVersion = false;
    const { publishing: { publishedVersion } = {} } = this.api.adviceset;
    // console.log("setActiveApiChannel",this.api.adviceset)
    if (publishedVersion && publishedVersion !== null) {
      if (channel == "published") {
        version = ` <span class="fs-xs">(v${publishedVersion})</span>`;
      }
      hasPublishedVersion = true;
    }

    $channelItems.addClass("active").siblings().removeClass("active");

    if (!hasPublishedVersion) {
      $switcher.find("[data-channel=published]").hide();
    }

    $("span[data-channel-name]").html(`${_.startCase(_.camelCase(channel))}${version}`); // capitalize 1st letter
  }

  /**
   * Handle changing API channel
   */
  handleChangeApiChannel() {
    $(document).on("click", "a[data-action=set-channel]", e => {
      e.preventDefault();
      const $el = $(e.currentTarget);
      const { channel } = $el.data();
      store.set("api_channel", channel);
      this.showToast(undefined, {
        title: "Hang tight!",
        message: `Changing to ${channel} channel. Refreshing in 3 seconds...`
      });
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    });
  }

  /**
   * Set the active audience in the switcher
   */
  setActiveAudience(audienceId = -1) {
    const $switcher = $(".audience-switcher");
    const $audItem = $switcher.find(`a[data-audience-id=${audienceId}]`);
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
    $(document).on("click", "a[data-action=set-audience]", e => {
      const $el = $(e.currentTarget);
      const { audienceId = -1 } = $el.data();
      this._loadApi(`audienceId=${audienceId}`, undefined, false).then(() => {
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

    const $formEls = $container.find("form").find("input,select").filter(":not(.is-other-response)");
    $formEls.each((i, el) => {
      const $el = $(el);
      if ($el.is(":radio")) {

        // for Bools, we need to stringify `true` and `false` to check the radio button
        if (fieldType == "Boolean") {
          value = String(value);
        }

        if ($el.prop("value") == value || $el.prop("value") == "\""+value+"\"") {
          $el.prop("checked", true);
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
    return $form.find(types).filter(":not(:radio):not(:hidden):not(.is-other-response)");
  }
  // #endregion
}
