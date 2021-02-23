import _ from "lodash";
import { Controller } from "stimulus";
import TaffrailAdvice from "../taffrailapi";
import Turbolinks from "turbolinks";
import qs from "querystring";
import Handlebars from "handlebars";

export default class extends Controller {
  // static targets = ["title", "description"];
  // static values = { id: String };

  connect() {
    // console.log("CONNECTED pay debt")
  }

  initialize() {
    // advicsetId = this.idValue

    // $("#breadcrumb").html("&nbsp;/&nbsp;Save for retirement");

    this.TaffrailAdvice = new TaffrailAdvice();
    this.TaffrailAdvice.init();

    // when data is updated after page-load, use this fn
    this.TaffrailAdvice.$loadingContainer = $("main.screen");
    this.TaffrailAdvice.updateFn = (data, initial = false) => {
      // update content
      this.updatePanes();
      this.TaffrailAdvice.updatePanes();
      // save state
      const loc = `${window.location.pathname}?${qs.stringify(_.omit(this.TaffrailAdvice.api.params, this.TaffrailAdvice.paramsToOmit))}`;
      if (initial) {// on init, use REPLACE
        Turbolinks.controller.replaceHistoryWithLocationAndRestorationIdentifier(loc, Turbolinks.uuid());
      } else {
        Turbolinks.controller.pushHistoryWithLocationAndRestorationIdentifier(loc, Turbolinks.uuid());
      }
    }

    // current querystring without "?" prefix
    const querystring = location.search.substr(1);
    // default values for this adviceset
    const defaults = {
      "401K_Tiers": 2,
      "401K_Match_Default_Tiers?": true,
    }
    // if (this.TaffrailAdvice.UserProfile?.Age_Now <= 29) {
    //   defaults["401K_Contribution_Goal"] = "Maximize Match";

    // users in 30s default to "contribute all i'm allowed"
    if (window.jga.UserProfile?.savedProfile?.Age_Now <= 39) {
      defaults["401K_Contribution_Goal"] = "maximize contributions";
    }

    const data = qs.stringify(_.assign(defaults, qs.parse(querystring)));
    this.TaffrailAdvice.load(data, $("main.screen")).then(api => {
      // DOM updates
      this.TaffrailAdvice.updateFn(api, "initial page load");
    });
  }

  /**
   * Update 3 panes. This fn is called each time the API updates.
   */
  updatePanes() {
    this.TaffrailAdvice.mapData();
    this.updateMainPane();
    this.TaffrailAdvice.updateAssumptionsList();
  }

  updateMainPane() {
    const { api } = this.TaffrailAdvice;
    // render
    if (api.display.type == "INPUT_REQUEST") {
      // $(".advice").slideDown(300);
      this.TaffrailAdvice.updateForInputRequest();
    } else {
      // must be advice
      if (api.display._isLast) {
        // since it's "last", hide the question.
        // $(".advice").slideUp(300);

        // override "display" with Advice
        api.display.advice = api.recommendations["Our Advice"] || [api.display];
      }

      $(".goal-result").show();

      // use this to use the "Grouped Advice" template
      // this.TaffrailAdvice.updateForAdvice();

      const { variables_map: {
        Age_Now
      } } = api;

      const retirement_year = `Retire in ${new Date().getFullYear() + (65 - Age_Now.value)}`;

      let tips = [];
      let ideas = [];

      if (api.recommendations["Maximizing your employer match"] && api.recommendations["Maximizing your employer match"].length) {
        tips = api.recommendations["Maximizing your employer match"].map(adv => {
          return {
            tip: adv.headline_html || adv.headline,
            action: "#"
          }
        });
      }

      if (api.recommendations["Ideas to Consider"] && api.recommendations["Ideas to Consider"].length) {
        ideas = api.recommendations["Ideas to Consider"].map(adv => {
          return {
            tip: adv.headline_html || adv.headline,
            action: "#"
          }
        });
      }

      const goal = {
        retirement_year,
        tips,
        ideas
      }
      api.display.goal = goal;

      const str = Handlebars.compile($("#tmpl_advice_save_retirement").html())(api);
      this.TaffrailAdvice.$advice.html(str);
    }

  }
}
