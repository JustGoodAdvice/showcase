/* eslint-disable new-cap */
import _ from "lodash";
import Handlebars from "handlebars";
import Mousetrap from "mousetrap";
import qs from "querystring";
import ShowcasePage from "../showcasePage";
import store from "store";

export default class extends ShowcasePage {
  init() {
    // disable advice grouping
    this.GROUPED_ADVICE_ENABLED = false;

    super.init();

    this.initCache();
    this.handleClickOpenOffCanvasControls();
    this.handleOffCanvasEvt();

    this.updateAdviceSetDetails().then(() => {
      // current querystring without "?" prefix
      const querystring = location.search.substr(1);
      return this._loadApi(querystring, $(".row .advice")).then(api => {
        if (!api) {
          return Promise.reject(new Error("API unavailable"));
        }
        // on page load, save current state without API params
        const currQs = qs.stringify(_.omit(qs.parse(querystring), this.paramsToOmit));
        this.history.replace(`${this.baseUrl}/${this.viewName}?${currQs}`, this.api);
        parent.window.jga.launch_history.replace(`${this.baseUrl}/launch?${currQs}`, this.api);
        // DOM updates
        this.updatePanes();
        // events
        this.handleClickContinue();
        this.handleClickBack();
        this.handleClickCloseQuestion();
        this.handleClickAssumption();
        this.handleClickTaffrailVar();
        this.handleChangeApiChannel();
        this.listenForUrlChanges();
        this.handleClickOpenRawDataModal();
        this.handleClickOnAiUrSidebar();

        // keyboard shortcuts
        // screenshot
        Mousetrap.bind("p s", () => {
          const link = `/s/${window.jga.api.adviceset.id}/__cleanshot`;
          const querystr = qs.parse(location.search.substr(1));
          window.location.href = `${link}?${qs.stringify(querystr)}`;
        });
        // expand/collapse controls sidebar
        Mousetrap.bind("s", () => {
          $("a.open-controls").first().trigger("click");
        });
        // show toast with keyboard shortcut map
        Mousetrap.bind("?", () => {
          this.showToast(undefined, {
            title: "Keyboard Shortcuts",
            message: "Press <code>s</code> to toggle controls.",
            delay: 5000
          });
        });

        // when data is updated after page-load, use this fn
        this.$loadingContainer = $(".row.advice-wrap");
        // this.scrollTo = $(".advice-set-details .lead").offset().top || 0;

        this.updateFn = (data) => {
          // update content
          this.updatePanes();
        }
      });
    });
  }

  /**
   * Slight speed update to cache frequently-used templates and selectors
   */
  initCache() {
    // cache element selectors
    this.$advice = $(".advice");
    // cache templates

    const compile = (selector) => {
      try {
        return Handlebars.compile($(selector).html());
      } catch (e) {
        return null;
      }
    }

    this.TEMPLATES = {
      "AdviceSetDetails": compile("#tmpl_adviceSetDetails"),
      "AdviceSetScenarios": compile("#tmpl_advicesetScenarios"),
      "AdviceSetReferences": compile("#tmpl_advicesetReferenceDocs"),
      "AdviceSetAiUR": compile("#tmpl_advicesetUserQuestions"),
      "AnswerChatBubbles": compile("#tmpl_answersListChatBubbles"),
      "InputRequest": compile("#tmpl_adviceInputRequest"),
      "Advice": compile("#tmpl_adviceAdvice"),
      "Recommendations": compile("#tmpl_groupedRecommendationsAdviceList"),
      "RecommendationsList": compile("#tmpl_recommendationsAdviceList"),
      "Assumptions": compile("#tmpl_assumptionsList"),
      "QuestionsAnswers": compile("#tmpl_answersList"),
      "Error": compile("#tmpl_error"),
    };
  }

  /**
   * Update Advice Set details (banner + detail)
   */
  updateAdviceSetDetails() {

    // internal helper to render banner & update <title>
    const _render = (data) => {
      if (this.TEMPLATES["AdviceSetDetails"]) {
        const str = this.TEMPLATES["AdviceSetDetails"](data);
        $(".advice-set-details").html(str);
      }

      // update adviceset titles anywhere
      $("[data-advice-set-title]").text(data.adviceset.title);
      // update the window title
      this.windowTitle = `${data.adviceset.title} - ${data.adviceset.owner.name}`;

      // if user preference has controls visible, open on page load
      if (store.get("offcanvas_visible", false)) {
        new bootstrap.Offcanvas(document.getElementById("offcanvas-controls")).show();
      }
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
        description: null, // Removed 5/17 for UX simplication only. //entity.description,
        owner: owner,
        _links: this.api.adviceset._links
      }

      // add new adviceset data to the state
      this.api.adviceset = _.extend(this.api.adviceset, {
        adviceScenarios,
        aiUserRequests,
        publishing,
        tags,
        entity,
        owner
      });

      // check for referring AI UserRequest ID on querystring
      // and find matching question for banner
      const querystr = qs.parse(location.search.substr(1));
      this.fromAiUrId = querystr.aiUrId;
      if (this.fromAiUrId) {
        const matchingAiUr = aiUserRequests.find(aiur => { return aiur.id == this.fromAiUrId });
        if (matchingAiUr) {
          const { request /* , description*/ } = matchingAiUr;
          data.adviceset.title = request;
          data.adviceset.description = null; // description ? description : entity.description;
        }
      }

      // advice set heading
      _render(data);

      // scenarios
      if (this.TEMPLATES["AdviceSetScenarios"]) {
        const filteredScenarios = adviceScenarios.filter(s => { return s.verifiedStatus == "success"; }).map(s => {
          if (!_.has(s,"shortUrl")) {
            s.url = `/s/${this.api.adviceset.id}/?${qs.stringify(s.params)}`;
          }
          return s;
        })
        const str = this.TEMPLATES["AdviceSetScenarios"]({ scenarios: filteredScenarios });
        $(".adviceset-scenarios").html(str);
      }

      // AI User Requests
      if (this.TEMPLATES["AdviceSetAiUR"]) {
        const strAiUrs = this.TEMPLATES["AdviceSetAiUR"](this.api);
        $(".adviceset-user-questions").html(strAiUrs);
      }

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
   * Update 3 panes. This fn is called each time the API updates.
   */
  updatePanes() {
    // save state
    const _qs = qs.stringify(_.omit(this.api.params, this.paramsToOmit));
    this.history.push(`${this.baseUrl}/${this.viewName}?${_qs}`, this.api);
    parent.window.jga.launch_history.push(`${this.baseUrl}/launch?${_qs}`, this.api);

    this.mapData();
    this.updateMainPane();
    this.updateAssumptionsList();
    this.updateRecommendationsList();
    this.updateVariablesList();
    this.updateTaffrailVarHtml(true);
  }

  /**
   * Map data from API for this showcase's handlebars templates
   */
  mapData() {
    // setup "display" card — either question or "advice".
    // `api.advice` is an array of every input + advice node
    this.api.display = _.last(this.api.advice) || {};
    // build collection of just answers & assumptions
    this.api.answers = [].concat(this.api.advice || []).filter(a => { return a.type == "INPUT_REQUEST"; }).map((a, i) => {
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

  // #region templating
  /**
   * Update center Advice/Question pane
   */
  updateMainPane() {
    this._setCurrentIdx();

    this.$advice.find(".question").show();
    if (this.api.display.type == "INPUT_REQUEST") {
      this._updateForInputRequest();
      $("html").addClass("question-show");
      if ($(".list-all-recommendations").children(".advice-item").length) {
        $("html").addClass("question-show--with-advice");
      }
      $(".list-all-recommendations").addClass("unfocused").removeClass("has-primary-advice");
    } else {
      // see `updateRecommendationsList`
    }
  }

  /**
   * Remove css classes from when question was visible
   */
  _closeQuestionModal() {
    $("html").removeClass("question-show").removeClass("question-show--with-advice");
    this.$advice.removeAttr("style").find(".question").removeAttr("style").hide();
    $(".list-all-recommendations").removeClass("unfocused");
  }

  // #region templating utils
  /**
   * Template update for "primary advice" (last advice in highest weighted group)
   *
   */
  _updateForPrimaryAdvice() {
    // if this is the LAST advice, hide center column and move advice list into center focus
    if (this.api.display._isLast) {
      this._closeQuestionModal();

      // if the rule has primary advice ... but no grouped recommendations and sources
      // show the sources container.
      if (this.api._referenceDocumentsExist && !this.api._recommendationsExist) {
        $(".list-all-recommendations").addClass("show");
      }
    }
  }

  /**
   * Template update for INPUT_REQUEST
   */
  _updateForInputRequest() {
    this._closeQuestionModal();

    // update form type to handle YES/NO (boolean type, not radio)
    // if (this.api.display.form.fieldType == "Radio") {
    //   const { values = [] } = this.api.display.form;
    //   const labels = values.map(v => { return v.label });
    //   if (values.length == 2 && labels.includes("Yes") && labels.includes("No")) {
    //     this.api.display.form.fieldType = "Boolean";
    //   }
    // }

    // render
    const str = this.TEMPLATES["InputRequest"](this.api);
    this.$advice.html(str);

    // hide "X" close question button if question is not yet answered
    if (this.api.display.value == null) {
      $(".advice").find(".q-close").hide();
    }

    this._positionQuestionModal();

    // hide "next" button unless it's a numeric input
    // const isRadio = this.api.display.form.fieldType.match(/Radio|Boolean/);
    // $(".advice").find("button[type=submit]").toggle(!(isRadio && isRadio.length > 0));

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
    const str = this.TEMPLATES["QuestionsAnswers"](this.api);
    const strAssump = this.TEMPLATES["Assumptions"](this.api);
    $(".answers").html(str);
    $(".assumptions").html(strAssump);
  }

  /**
   * Update advice list by group
   */
  updateRecommendationsList() {
    // simple helpers for UX
    this.api.isSalesforce = $("body").hasClass("launch--salesforce");
    this.api._recommendationsExist = this.api.recommendations.length > 0;
    this.api._referenceDocumentsExist = this.api.adviceset.referenceDocuments.length > 0;

    // render
    const tmpl = this.GROUPED_ADVICE_ENABLED ? "Recommendations" : "RecommendationsList";
    const str = this.TEMPLATES[tmpl](this.api);
    $(".list-all-recommendations").html(str);

    if (this.TEMPLATES["AdviceSetReferences"]) {
      const strReferences = this.TEMPLATES["AdviceSetReferences"](this.api);
      $(".adviceset-references").html(strReferences);
    }

    if (this.TEMPLATES["AnswerChatBubbles"]) {
      // do we have ANY answers yet?
      // show or hide depending
      // simple helper for UX
      this.api._answersExist = this.api.answers.length > 0;

      const str = this.TEMPLATES["AnswerChatBubbles"](this.api);
      $(".answers-chat-bubbles").html(str);
    }

    // One more step....
    this._updateForPrimaryAdvice();
    this._setupChartsAll();
  }

  /**
   * Set position of the modal so it's at the bottom of the window but never below the fold
   */
  _positionQuestionModal() {
    const $ques = this.$advice.find(".question");
    const quesPos = $ques.offset();
    const quesModalHeight = $ques.outerHeight();
    const quesModalBottom = quesPos.top + quesModalHeight;
    const viewportHeight = $(window).height();
    const SPACER = 50;

    if (quesModalBottom > viewportHeight) {
      let newTop = viewportHeight - quesModalHeight - SPACER;
      if (newTop < 0) { newTop = SPACER; }
      $ques.css({
        top: newTop
      });
      $ques.parent().css({
        position: "absolute",
        top: 0
      });
    } else {
      $ques.parent().removeAttr("style");
    }
  }

  /**
   * Change the highlighted assumption in the list based on
   * active display.
   */
  _setAssumptionActive(isAdvice) {
    if (isAdvice) {
      $("aside .assumptions, .answers").find("a").removeClass("active");
    } else {
      const { id } = this.api.display;
      const $statement = $("aside .assumptions, .answers").find("a").removeClass("active").end().find(`a[data-id=${id}]`);
      $statement.addClass("active");
      // if inside accordion, open relevant section
      if ($statement.parents(".accordion-item").length) {
        // close open accordion but NOT current one
        const $currentAcc = $statement.closest(".accordion-collapse");

        // open relevant one, if not already open
        if (!$currentAcc.hasClass("show")) {
          $currentAcc.prev().find("button").trigger("click");
        }
      }
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
 * Sets up chart
 * @param {boolean} isChart
 */
  setupChart(isChart, chartId) {
    // setup the chart...
    const self = this;
    if (isChart) {
      const $charts = $(`[data-id=${chartId}]`);
      $charts.each(function() {
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


  // #region event handlers
  handleOffCanvasEvt() {
    $(".controls.offcanvas").on("hide.bs.offcanvas", e=> {
      $("#offcanvas-controls-handle").removeClass("show");
      store.set("offcanvas_visible", false);
    });
    $(".controls.offcanvas").on("show.bs.offcanvas", e=> {
      $("#offcanvas-controls-handle").addClass("show");
      store.set("offcanvas_visible", true);
    });
  }

  /**
   * "Next" button handler
   */
  handleClickContinue() {
    // pressing radio button auto-advances to next
    this.$advice.on("click", ".form-check label.btn", e => {
      const $lbl = $(e.currentTarget);
      $lbl.prev("input").prop("checked", true);
      const $form = $lbl.closest("form");
      $form.trigger("submit");
    });

    this.$advice.on("submit", "form", e => {
      const $form = $(e.currentTarget);

      // $("html, body").animate({ scrollTop: this.scrollTo });

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

      this._loadApi(data, undefined, false).then(() => {
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
      // $("html, body").animate({ scrollTop: this.scrollTo });
      // temp override `display` global prop to insert question into HTML
      this.api.display = display;
      this.updateMainPane();
    });
  }

  /**
   * "Close question" button handler
   */
  handleClickCloseQuestion() {
    this.$advice.on("click", "a.q-close", e => {
      e.preventDefault();
      this._setCurrentIdx();
      this._setAssumptionActive("advice");
      this._closeQuestionModal();
    });
  }

  /**
   * "Controls" button handler
   */
  handleClickOpenOffCanvasControls() {
    $(document).on("click", "a.open-controls", e => {
      e.preventDefault();
      new bootstrap.Offcanvas(document.getElementById("offcanvas-controls")).show();
    });
  }

  /**
   * Click handler for assumptions or Q&A
   */
  handleClickAssumption() {
    $("aside .assumptions, li.qa.bubble").on("click", "a.statement,a", e => {
      e.preventDefault();
      const $this = $(e.currentTarget);
      const data = $this.data();
      // $("html, body").animate({ scrollTop: this.scrollTo });
      // temp override `display` global prop to insert question into HTML
      // when user presses "OK" to keep or change answer, global data is refreshed/restored
      const answer = _.flatMap(this.api.assumptions).find((a) => { return a.idx == data.idx; });
      this.api.display = answer;
      this.api.display.idx = answer.idx;
      this.updateMainPane();
    });
  }

  /**
   * Click handler for AI User Request on sidebar
   */
  handleClickOnAiUrSidebar() {
    $("aside .adviceset-user-questions").on("click", "a.ai-request", e => {
      e.preventDefault();
      const $this = $(e.currentTarget);
      const [,id] = $this.prop("href").split("#");
      const querystr = qs.parse(location.search.substr(1));
      if (id == "reset") {
        delete querystr.aiUrId;
      } else {
        querystr.aiUrId = id;
      }
      window.location.href = `${this.baseUrl}/${this.viewName}?${qs.stringify(querystr)}`;
    });
  }

  /**
   * click taffrail var
   */
  handleClickTaffrailVar() {
    $(document).on("click", "taffrail-var.active", e => {
      e.preventDefault();
      const $this = $(e.currentTarget);
      const { idx } = $this.data();
      $this.tooltip("hide");
      // $("html, body").animate({ scrollTop: this.scrollTo });
      // temp override `display` global prop to insert question into HTML
      // when user presses "OK" to keep or change answer, global data is refreshed/restored
      const answer = _.flatMap(this.api.answers).find((a) => { return a.idx == idx; });
      this.api.display = answer;
      this.api.display.idx = answer.idx;
      this.updateMainPane();
    });
  }
  // #endregion
}
