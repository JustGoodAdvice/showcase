/* eslint-disable new-cap */
import _ from "lodash";
import Handlebars from "handlebars";
import Mousetrap from "mousetrap";
import qs from "querystring";
import store from "store";
import ShowcasePage from "./showcasePage";
import copy from "clipboard-copy";
import numeral from "numeral";
export default class showcaseHarness extends ShowcasePage {
  // #region getter/setter
  // override
  get baseUrl() {
    return `/s/${this.api.adviceset.id}/harness`;
  }
  // #endregion
  /**
   * One-time initialization
   */
  init() {
    super.init();
    this.initCache();
    this.AUTO_EXPAND_RECOMMENDATION_COUNT = 1;
    // get banner
    this.updateAdviceSetDetails().then(() => {
      // current querystring without "?" prefix
      const querystring = location.search.substr(1);
      return this._loadApi(querystring, $(".row .advice")).then(api => {
        // on page load, save current state without API params
        const currQs = qs.stringify(_.omit(qs.parse(querystring), this.paramsToOmit));
        this.history.replace(`${this.baseUrl}/?${currQs}`, this.api);
        // DOM updates
        this.updatePanes();
        // events
        this.handleClickContinue();
        this.handleClickBack();
        this.handleClickAssumption();
        this.handleClickTaffrailVar();
        this.handleCopyFormula();
        this.handleCollapseAdviceSummaries();
        this.handleCollapseAssumptionGroup();
        this.listenForUrlChanges();
        this.handleClickExpandControls();
        // this.handleResizeChart();

        // keyboard shortcuts
        // screenshot
        Mousetrap.bind("p s", () => {
          const link = `/s/${window.jga.api.adviceset.id}/__cleanshot`;
          const querystr = qs.parse(location.search.substr(1));
          window.location.href = `${link}?${qs.stringify(querystr)}`;
        });
        // expand/collapse advice
        Mousetrap.bind("a", () => {
          $("a[data-expand=advice]").trigger("click");
        });
        // expand/collapse assumptions
        Mousetrap.bind("s", () => {
          $("a[data-expand=assumptions]").trigger("click");
        });
        // show toast with keyboard shortcut map
        Mousetrap.bind("?", () => {
          this.showToast(undefined,{
            title: "Keyboard Shortcuts",
            message: "Press <code>a</code> to expand advice.<br>Press <code>s</code> to expand assumptions.",
            delay: 5000
          });
        });

        // when data is updated after page-load, use this fn
        this.$loadingContainer = $(".advice-outer-container");
        this.scrollTo = 0;

        this.updateFn = (data) => {
          // update content
          this.updatePanes();
          // save state
          this.history.push(`${this.baseUrl}/?${qs.stringify(_.omit(this.api.params, this.paramsToOmit))}`, this.api);
        }
      });
    });
  }

  /**
   * Update 3 panes. This fn is called each time the API updates.
   */
  updatePanes(){
    this.mapData();
    this.updateMainPane();
    this.updateAssumptionsList();
    this.updateRecommendationsList();
    this.updateAdviceDebugSidebar();
    this.updateVariablesList();
    this.updateTaffrailVarHtml();
  }

  // #region event handlers
  /**
   * "Next" button handler
   */
  handleClickContinue() {
    this.$advice.on("submit", "form", e => {
      const $form = $(e.currentTarget);

      $("html, body").animate({ scrollTop: this.scrollTo });

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

      this._loadApi(data, $(".row .advice"), false).then(()=> {
        this.updateFn();
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
      $("html, body").animate({ scrollTop: this.scrollTo });
      // temp override `display` global prop to insert question into HTML
      this.api.display = display;
      this.updateMainPane();
    });
  }

  /**
   * Click handler for assumptions or Q&A
   */
  handleClickAssumption() {
    $(".answers, .assumptions").on("click", ".a > a, a.statement", e => {
      e.preventDefault();
      const $this = $(e.currentTarget);
      const data = $this.closest("li").data();
      $("html, body").animate({ scrollTop: this.scrollTo });
      // temp override `display` global prop to insert question into HTML
      // when user presses "OK" to keep or change answer, global data is refreshed/restored
      const answer = _.flatMap(this.api.assumptions).find((a) => { return a.idx == data.idx; });
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
      const isCalculated = $this.hasClass("active--calculated");
      if (isCalculated) {
        return;
      }
      const { idx } = $this.data();
      $("html, body").animate({ scrollTop: this.scrollTo });
      // temp override `display` global prop to insert question into HTML
      // when user presses "OK" to keep or change answer, global data is refreshed/restored
      const answer = _.flatMap(this.api.answers).find((a) => { return a.idx == idx; });
      this.api.display = answer;
      this.api.display.idx = answer.idx;
      this.updateMainPane();
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
   * Handle expando/collapso links on sidebar
   */
  handleClickExpandControls() {
    $("main").on("click", "a[data-expand]", e => {
      e.preventDefault();
      const $this = $(e.currentTarget);
      const { expand } = $this.data();

      $this.tooltip("hide");

      let $collapsibles;
      if (expand == "assumptions") {
        $collapsibles = $(".assumptions-list.collapse");
      } else if (expand == "advice") {
        $collapsibles = $(".advice-list").find(".collapse");
      }

      // open or close?
      const { collapsed = true } = $this.data();
      const collapse = collapsed ? "show" : "hide";
      $collapsibles
        .collapse(collapse)
        .on("shown.bs.collapse", e => { this._toggleCollapseLink($this, true) })
        .on("hidden.bs.collapse", e => { this._toggleCollapseLink($this, false) });

      this._toggleCollapseLink($this, collapse == "show");
    });
  }

  /**
   * The interactive chart embed is inside an iframe and when the window resizes
   * the iframe needs to be re-loaded.
   */
  handleResizeChart() {
    let timer;
    $(window).resize(() => {
      if (this.api.display.type == "ADVICE") {
        if (timer) {
          window.clearTimeout(timer);
        }
        timer = setTimeout(() => {
          this.updateMainPane();
        }, 500);
      }
    });
  }
  // #endregion

  // #region templating
  /**
	 * Update center Advice/Question pane
	 */
  updateMainPane(){
    this._setCurrentIdx();

    $(".question").show();
    if (this.api.display.type == "INPUT_REQUEST") {
      this._updateForInputRequest();
      $(".list-all-recommendations").addClass("unfocused").removeClass("has-primary-advice");
    } else {
      $(".rs-context").remove();
      // see `updateRecommendationsList`
    }
  }

  // #region templating utils
  /**
   * Template update for "primary advice" (last advice in highest weighted group)
   *
   */
  _updateForPrimaryAdvice() {
    // if this is the LAST advice, hide center column and move advice list into center focus
    if (this.api.display._isLast) {
      if (this.primaryAdviceModeEnabled) {
        this.api.display = this.api.display_primary_advice;
      }

      $(".question").hide();
      $(".list-all-recommendations").removeClass("unfocused");

      if (this.primaryAdviceModeEnabled) {
        $(".list-all-recommendations").addClass("has-primary-advice");
      }

      // if there's < N expandable advice recommendations displayed, expand them automatically
      const { AUTO_EXPAND_RECOMMENDATION_COUNT: ct } = this;
      if (_.flatMap(this.api.recommendations).filter(a => { return a.summary }).length < ct) {
        setTimeout(()=>{
          $(".advice-list .collapse").collapse("show");
        }, 50);
      }

      if (this.primaryAdviceModeEnabled) {
        const str = this.TEMPLATES["Advice"](this.api);
        this.$advice.html(str);
      }

      // if the rule has primary advice ... but no grouped recommendations and sources
      // show the sources container.
      if (this.api._referenceDocumentsExist && !this.api._recommendationsExist){
        $(".list-all-recommendations").addClass("show");
      }
    }
  }

  /**
   * Template update for INPUT_REQUEST
   */
  _updateForInputRequest() {
    // render

    // IR belongs to this adviceset or another?
    const outOfContext = this.api.adviceset._id !== this.api.display.ruleSetId;
    if (outOfContext) {
      this.api.display._outOfContext = true;

      new Promise((resolve) => {
        const outOfContextRuleSetCache = store.get(`taffrail_adviceset_${this.api.display.ruleSetId}`);
        if (outOfContextRuleSetCache) {
          return resolve(outOfContextRuleSetCache);
        } else {
          return $.ajax({
            url: `${this.config.api_host}/api/adviceset/${this.api.display.ruleSetId}`,
            type: "GET",
            dataType: "json",
            headers: {
              "Accept": "application/json; chartset=utf-8",
              "Authorization": `Bearer ${this.config.api_key}`
            }
          }).then(api => { return resolve(api); });
        }
      }).then(api => {
        const { data: { entity: { name, meta: { isStarter = false } } } } = api;
        store.set(`taffrail_adviceset_${this.api.display.ruleSetId}`, api);

        if (isStarter === true) {
          const abLink = `${this.config.advicebuilder_host}/advicesets/${this.api.display.ruleSetId}/show`;
          $(`#context_${this.api.display.ruleSetId}`).html(`<i class="fal fa-tasks"></i>&nbsp;<a href="${abLink}" target=_blank>${name}`);
        } else {
          this.api.display._outOfContext = false;
          $(`#context_${this.api.display.ruleSetId}`).hide();
        }
      });
    }

    const str = this.TEMPLATES["InputRequest"](this.api);
    this.$advice.html(str);

    // set value
    this._setValue();
    // set input masks
    this._handleInputMasks();
    // focus input
    this._focusFirstInput();
    // highlight active assumption/question
    this._setAssumptionActive();
  }

  /**
   * Template update for ADVICE
   */
  _updateForAdvice() {
    // render
    const str = this.TEMPLATES["Advice"](this.api);
    this.$advice.html(str);

    // unhighlight active assumption/question
    this._setAssumptionActive("advice");
  }

  /**
   * Map data from API for this showcase's handlebars templates
   */
  mapData() {
    // setup "display" card — either question or "advice".
    // `api.advice` is an array of every input + advice node
    this.api.display = _.last(this.api.advice) || {};
    // build collection of just answers & assumptions
    this.api.answers = [].concat(this.api.advice||[]).filter(a => { return a.type == "INPUT_REQUEST"; }).map((a, i) => {
      a.idx = i;
      return a;
    });

    // remove last item, it's always an unanswered question
    if (this.api.display.type == "INPUT_REQUEST") {
      this.api.answers.pop();
    }

    // assumptions are grouped, answers are not
    const ASSUMPTIONS_UNGROUPED = "Assumptions";
    const ASSUMPTIONS_UNGROUPED_ID = `assumptions_${this.api.adviceset.id}`;
    this.api.assumptions = _.groupBy(this.api.answers, (a) => {
      return (a.tagGroup) ? a.tagGroup.name : ASSUMPTIONS_UNGROUPED;
    });

    // fix input requests with boolean variables in statements
    this.fixInputRequestsWithBooleanVars();
    this.filterAssumptionsWithoutStatement();

    // go through each assumption group and set open/close state
    Object.keys(this.api.assumptions).forEach((key, idx) => {
      const arr = this.api.assumptions[key];
      this.api.assumptions[key] = arr.map(a => {
        // add tagGroup because these items don't have one assigned
        if (key == ASSUMPTIONS_UNGROUPED) {
          a.tagGroup = {
            name: ASSUMPTIONS_UNGROUPED,
            id: ASSUMPTIONS_UNGROUPED_ID
          }
        }
        // add `_isOpen` flag to each item
        a._isOpen = store.get(`assumption_${a.tagGroup.id}_${this.api.adviceset.id}`, true);
        return a;
      });
    });

    this.putPersonalProfileFirst();
    this.deleteEmptyAssumptionGroups();

    this.mapAdviceData();
    this.mapReferenceDocuments();
  }

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
  // #endregion

  /**
	 * Update Advice Set details (banner + detail)
	 */
  updateAdviceSetDetails(){

    // internal helper to render banner & update <title>
    const _render = (data) => {
      const str = this.TEMPLATES["AdviceSetDetails"](data);
      $(".advice-set-details").html(str);
      // update the window title
      this.windowTitle = `${data.adviceset.title} - ${data.adviceset.owner.name}`;
    }

    const data = { adviceset: {} }

    return $.ajax({
      url: this.api.adviceset._links.self,
      type: "GET",
      dataType: "json",
      headers: {
        "Accept": "application/json; chartset=utf-8",
        "Authorization": `Bearer ${this.config.api_key}`
      }
    }).then(api => {
      const { data: { aiUserRequests = [], adviceScenarios, entity, publishing, owner, tags } } = api;

      this.config.adviceset = api.data;

      data.adviceset = {
        title: entity.name,
        description: entity.description,
        owner: owner,
        _links: this.api.adviceset._links
      }

      // add new adviceset data to the state
      this.api.adviceset = _.extend(this.api.adviceset, {
        adviceScenarios,
        aiUserRequests,
        publishing,
        tags
      });

      // check for referring AI UserRequest ID on querystring
      // and find matching question for banner
      if (this.fromAiUrId) {
        const matchingAiUr = aiUserRequests.find(aiur => { return aiur.id == this.fromAiUrId });
        if (matchingAiUr) {
          const { request, description } = matchingAiUr;
          data.adviceset.title = request;
          data.adviceset.description = description ? description : entity.description;
        }
      }

      _render(data);
    }).catch(jqXHR => {
      let err = "Error";
      if (jqXHR.responseJSON) {
        err = jqXHR.responseJSON.error.message;
      } else {
        err = jqXHR.statusText || jqXHR.message;
      }
      // insert error on banner
      _render({
        adviceset: {
          title: err,
          description: "API unavailable"
        }
      });
    });
  }

  /**
	 * Update assumptions/answers/history list
	 */
  updateAssumptionsList(){
    // do we have ANY assumptions/answers yet?
    // show or hide depending
    // simple helper for UX
    this.api._answersExist = this.api.answers.length > 0;
    $(".assumptions-container > div").css("visibility", this.api._answersExist ? "visible" : "hidden");
    $(".assumptions-outer-container").toggleClass("assumptions-outer-container--empty", !this.api._answersExist);
    // only show expand button if there's grouped assumptions besides "ungrouped"
    $(".assumption-expander").toggle(_.without(Object.keys(this.api.assumptions), "ungrouped").length > 0);

    // render
    const str = this.TEMPLATES["QuestionsAnswers"](this.api);
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
    this.api._referenceDocumentsExist = this.api.adviceset.referenceDocuments.length > 0;
    this.api._showPrimaryPersonalized = (this.api._recommendationsExist && recommendationGroupCount >= 2) || this.api._referenceDocumentsExist;

    // render
    const str = this.TEMPLATES["Recommendations"](this.api);
    $(".list-all-recommendations").html(str);

    // One more step....
    this._updateForPrimaryAdvice();
    this._setupChartsAll();
    this.fetchReferencesOpenGraph();
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
	 * Update advice debug sidebar
	 */
  updateAdviceDebugSidebar() {
    // render
    this.api.formulaDebug = _.compact((this.api.formulaDebug||[]).map(f => {
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

    const str = this.TEMPLATES["AdviceDebugSidebar"](this.api);
    $(".advice-debug").html(str);
  }

  /**
   * Change the highlighted assumption in the list based on
   * active display.
   */
  _setAssumptionActive(isAdvice){
    const { id } = this.api.display;
    if (isAdvice) {
      $(".assumptions, .answers").find("li").removeClass("active");
    } else {
      $(".assumptions, .answers").find("li").removeClass("active").end().find(`li[data-id=${id}]`).addClass("active");
    }
  }
  // #endregion

  /**
   * Fetch OG meta for each reference
   */
  fetchReferencesOpenGraph() {
    const { referenceDocuments, id: adviceSetId } = this.api.adviceset;
    if (referenceDocuments.length) {
      const fns = [];
      referenceDocuments.forEach((rd, i) => {
        const { id, url, _links: { original: originalUrl = "" } } = rd;
        const size = { width: 235, height: 165 }
        const defaultImg = `https://picsum.photos/${size.width}/${size.height}?grayscale&random=${i}`;
        const localStoreBgImgKey = `${adviceSetId}_refdoc_${id}_bgImg`;
        fns.push(new Promise((resolve, reject) => {
          const bgImg = store.get(localStoreBgImgKey);
          if (bgImg) {
            $(`#img_container_${id}`).empty().css("background-image", `url("${bgImg}")`);
            return resolve();
          } else {
            return $.post("/api/ogs", { url: url }, (meta) => {
              if (!meta.success) {
                console.error("og failure", meta);
                $(`#img_container_${id}`).empty().css("background-image", `url("${defaultImg}")`);
                return resolve();
              }

              // pull the card image, default to a grayscale picsum
              const { ogImage = [] } = meta;
              const [img = {}] = ogImage;
              let { url = defaultImg } = img;

              // custom image for IRS website, their blue logo is too blue.
              if (originalUrl && originalUrl.includes("irs.gov")) {
                url = `${window.jga.config.cdn_host}/demos/irs-logo-white.png`;
              }

              // update doc so we don't have to do this again
              store.set(localStoreBgImgKey, url);

              // update DOM
              $(`#img_container_${id}`).empty().css("background-image", `url("${url}")`);
              return resolve();
            });
          }
        }));
      });
      return Promise.all(fns).then(() => {
        $("#group_references").find("[data-toggle=popover]").popover();
      });
    }
  }

  /**
   * Sets up chart
   * @param {boolean} isChart
   */
  setupChart(isChart, chartId) {
    // setup the chart...
    const self = this;
    if (isChart) {
      const $charts = $(`[data-id=${chartId}]`);
      $charts.each(function(){
        const $chart = $(this);
        const { src } = $chart.data();
        // parent container
        let $parentContainer = $chart.parents(".list-all-recommendations");
        if (!$parentContainer.length) {
          $parentContainer = $chart.parents(".advice");
        }
        const containerW = $parentContainer.outerWidth();
        const $iframe = $chart.find("iframe");
        // set chart container size
        $chart.css({
          height: 400,
          width: containerW
        });

        $iframe.on("load", e => {
          // specific data chart is expecting
          // TODO: clean this up in the chart code
          window.jga.config = _.extend(window.jga.config, {
            adviceSetId: self.api.adviceset.id,
            bgColor: "#fff",
            colors: ["#1C2145", "#3956EF"],
            width: containerW,
            height: 400
          });
          window.jga.advice = {
            session: Object.assign({
              ruleSetId: self.api.adviceset._id,
              ruleId: self.api.display.ruleId,
            }, self.api.params)
          }
          const data = {
            advice: window.jga.advice,
            config: window.jga.config
          }
          $iframe.get(0).contentWindow.postMessage(data, "*");
        });
        $iframe.prop("src", src);
      });
    }
  }

  /**
   * Sets up all charts
   */
  _setupChartsAll() {
    // quickly find all charts and set them up
    _.flatMap(this.api.recommendations).concat([this.api.display]).filter(a => {
      return a.attachment && a.attachment._isInteractiveChart;
    }).map(a => {
      return a.attachment;
    }).forEach(chart => {
      setTimeout(() => {
        this.setupChart(true, chart.id);
      }, 500);
    });
  }

  /**
   *
   * @param {jquery} $el Click target
   * @param {boolean} shown Open or closed?
   */
  _toggleCollapseLink($el, shown) {
    $el.find("span").text( shown ? "Collapse" : "Expand");
    $el.find("i").addClass( shown ? "fa-minus-square" : "fa-plus-square").removeClass( !shown ? "fa-minus-square" : "fa-plus-square");
    $el.data("collapsed", !shown);
  }
  // #endregion
}
