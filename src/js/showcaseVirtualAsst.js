/* eslint-disable new-cap */
import _ from "lodash";
import Handlebars from "handlebars";
import qs from "querystring";
import ShowcasePage from "./showcasePage";
import UserQuestionInstantSearch from "./userQuestions/instantsearch";

export default class showcaseVirtualAsst extends ShowcasePage {
  // #region getter/setter
  // override
  get baseUrl() {
    return `/s/${this.api.adviceset.id}/virtual-assistant`;
  }
  // #endregion

  /**
   * One-time initialization
   */
  init() {
    super.init();
    this.initCache();
    // current querystring without "?" prefix
    const querystring = location.search.substr(1);
    this._loadApi(querystring, $("main.screen")).then(api => {
      // on page load, save current state
      this.history.replace(`${this.baseUrl}/${location.search}`, this.api);
      // DOM updates
      this.updateAdviceSetDetails();
      this.updatePanes();
      // events
      this.handleClickContinue();
      this.handleClickBack();
      this.handleClickBubble();
      this.listenForUrlChanges();

      this.getAdviceSetUserQuestions().then(aiUserRequests => {
        const initialQuery = _.first(aiUserRequests).request;
        new UserQuestionInstantSearch({ initialQuery });
      });
    });

    // when data is updated after page-load, use this fn
    this.$loadingContainer = $("main.screen");
    this.updateFn = (data) => {
      // update content
      this.updatePanes();
      // save state
      this.history.push(`${this.baseUrl}/?${qs.stringify(this.api.params)}`, this.api);
    }
  }

  /**
   * Update 3 panes. This fn is called each time the API updates.
   */
  updatePanes(){
    this.mapData();
    this.updateMainPane();
    this.updateChatHistory();
    this.updateRecommendationsList();
    this._scrollChatBubbles();
  }

  // #region event handlers
  /**
   * "Next" button handler
   */
  handleClickContinue() {
    // pressing radio button auto-advances to next
    $(".screen").on("click", ".form-check label.form-check-label", e => {
      const $lbl = $(e.currentTarget);
      $lbl.prev("input").prop("checked", true);
      const $form = $lbl.closest("form");
      $form.submit();
    });

    $(".screen").on("submit", "form", e => {
      const $form = $(e.currentTarget);

      this._scrollTop();

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

      this._loadApi(data, $("main.screen")).then(()=> {
        // update content
        this.updatePanes();
        // save state
        this.history.push(`${this.baseUrl}/?${qs.stringify(this.api.params)}`, this.api);
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
      this._scrollTop();
      // temp override `display` global prop to insert question into HTML
      this.api.display = display;
      this.updateMainPane();
    });
  }

  /**
   * Click handler for clicking on a bubble to change answer
   */
  handleClickBubble() {
    $(".answers-chat-bubbles").on("click", ".a > a", e => {
      e.preventDefault();
      const $this = $(e.currentTarget);
      const data = $this.closest("li").data();
      this._scrollTop();
      // temp override `display` global prop to insert question into HTML
      // when user presses "OK" to keep or change answer, global data is refreshed/restored
      const display = _.flatMap(this.api.answers).find((a) => { return a.idx == data.idx; });
      this.api.display = display;
      this.api.display.idx = display.idx;
      const $bubbles = $(".answers-chat-bubbles").find(`li[data-id=${this.api.display.id}]`);
      $bubbles.hide();
      $bubbles.last().after(`<aside class="changing" id="change_bubble_${this.api.display.id}"></aside>`)
      this._updateForInputRequest($(`#change_bubble_${this.api.display.id}`));
    });
  }
  // #endregion



  // #region templating
  /**
	 * Update center Advice/Question pane
	 */
  updateMainPane(){
    // update the window title
    this.windowTitle = `${this.api.adviceset.title} - ${this.api.adviceset.owner.name}`;

    this._setCurrentIdx();

    // render
    if (this.api.display.type == "INPUT_REQUEST") {
      $(".advice").slideDown(300);
      this._updateForInputRequest();
    } else {
      // must be advice
      if (this.api.display._isLast) {
        // since it's "last", hide the question.
        $(".advice").slideUp(300);
      }
    }
  }

  // #region templating utils
  /**
   * Template update for INPUT_REQUEST
   */
  _updateForInputRequest($container = this.$advice) {
    // render
    const str = this.TEMPLATES["InputRequest"](this.api);
    $container.html(str);

    // hide "next" button unless it's a numeric input
    const isRadio = this.api.display.form.fieldType.match(/Radio|Boolean/);
    $container.find("button[type=submit]").toggle(!(isRadio && isRadio.length > 0));

    // set value
    this._setValue($container);
    // set input masks
    this._handleInputMasks($container);
    // focus input
    this._focusFirstInput($container);
  }

  /**
   * Map data from API for this showcase's handlebars templates
   */
  mapData() {
    // setup "display" card — either question or "advice".
    // `api.advice` is an array of every input + advice node
    this.api.display = _.last(this.api.advice) || {};
    // build collection of just answers
    this.api.answers = this.api.advice.filter(a => { return a.type == "INPUT_REQUEST"; }).map((a, i) => {
      a.idx = i;
      return a;
    });

    // remove last item, it's always an unanswered question
    if (this.api.display.type == "INPUT_REQUEST") {
      this.api.answers.pop();
    }

    const allAdvice = this.mapAdviceData();

    // group all advice into bucketed recommendations
    this.api.recommendations = _.groupBy(allAdvice, (a) => { return (a.tagGroup) ? a.tagGroup.name : "Recommendations"; });
    // add icon
    Object.keys(this.api.recommendations).forEach((key, idx) => {
      // add icons
      this.api.recommendations[key] = this.api.recommendations[key].map(a => {
        // use thumbs up icon by default
        // let icon = "fal fa-thumbs-up";
        let icon = "fal fa-arrow-circle-right";
        // support To Do/Completed checklist icons
        if (key.includes("To Do")) {
          icon = "fal fa-circle";
        } else if (key.includes("Completed") || key.includes("Accomplishments")) {
          icon = "fal fa-check-circle";
        }
        // save the helper for handlebars
        a._icon = icon;

        // determine if this is an interactive chart attachment
        const { attachment } = a;
        let isChart = false;
        if (attachment) {
          isChart = attachment.contentType == "application/vnd+interactive.chart+html";
          // handlebars helper
          attachment._isInteractiveChart = isChart;
        }

        return a;
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
    this.TEMPLATES = {
      "AdviceSetDetails": Handlebars.compile($("#tmpl_adviceSetDetails").html()),
      "InputRequest": Handlebars.compile($("#tmpl_adviceInputRequest").html()),
      "Recommendations": Handlebars.compile($("#tmpl_groupedRecommendationsAdviceList").html()),
      "AnswerChatBubbles": Handlebars.compile($("#tmpl_answersList").html()),
    };
  }
  // #endregion

  /**
	 * Update Advice Set details (left side)
	 */
  updateAdviceSetDetails(){
    // render
    const str = this.TEMPLATES["AdviceSetDetails"](this.api);
    $(".advice-set-details").html(str);
    $(".screen header.title").html(this.api.adviceset.title);
  }

  /**
	 * Update answers/history list
	 */
  updateChatHistory(){
    // do we have ANY answers yet?
    // show or hide depending
    // simple helper for UX
    this.api._answersExist = this.api.answers.length > 0;

    const str = this.TEMPLATES["AnswerChatBubbles"](this.api);
    $(".answers-chat-bubbles").html(str);
  }

  /**
	 * Update advice list by group
	 */
  updateRecommendationsList() {
    // simple helper for UX
    this.api._recommendationsExist = _.flatMap(this.api.recommendations).length > 0;

    // render
    const str = this.TEMPLATES["Recommendations"](this.api);
    $(".list-all-recommendations").html(str);

    this._setupChartsAll();
  }
  // #endregion

  // #region charts
  /**
   * Sets up chart
   * @param {boolean} isChart
   */
  setupChart(isChart, chartId) {
    // setup the chart...
    if (isChart) {
      const $chart = $(`[data-id=${chartId}]`);
      if (!$chart.length) { return; }
      const { src } = $chart.data();
      // parent container
      const containerW = $chart.parents(".list-all-recommendations").outerWidth();
      const $iframe = $chart.find("iframe");
      // set chart container size
      $chart.css({
        height: 350,
        width: containerW
      });

      $iframe.on("load", e => {
        // specific data chart is expecting
        // TODO: clean this up in the chart code
        window.jga.config = {
          adviceSetId: this.api.adviceset.id,
          bgColor: "#fff",
          colors: ["#605F5E", "#457B9D"],
          width: containerW,
          height: 350
        }
        window.jga.advice = {
          session: Object.assign({
            ruleSetId: this.api.adviceset._id,
            ruleId: this.api.display.ruleId,
          }, this.api.params)
        }
        const data = {
          advice: window.jga.advice,
          config: window.jga.config
        }
        $iframe.get(0).contentWindow.postMessage(data, "*");
      });
      $iframe.prop("src", src);
    }
  }

  /**
   * Sets up all charts
   */
  _setupChartsAll() {
    // quickly find all charts and set them up
    _.flatMap(this.api.recommendations).filter(a => {
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

  /**
   * Helper to scroll to bottom of chat
   */
  _scrollChatBubbles() {
    if ($("body").hasClass("uxmode-asst")) {
      setTimeout(() => {
        const top = $(".screen").get(0).scrollHeight;
        $(".screen").animate({ scrollTop: top });
      }, 300);
    } else {
      // move phone screen to top
      $(".screen").animate({ scrollTop: 0 });
    }
  }

  /**
   * Helper to scroll to top
   */
  _scrollTop() {
    // 80 = height of banner
    const top = $(".phone").offset().top - 90;
    $("html, body").animate({ scrollTop: top });
  }
  // #endregion
}