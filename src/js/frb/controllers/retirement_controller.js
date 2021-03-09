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
    let defaults = {
      "401K_Tiers": 2,
      "401K_Match_Default_Tiers?": true,
    }
    // if (this.TaffrailAdvice.UserProfile?.Age_Now <= 29) {
    //   defaults["401K_Contribution_Goal"] = "Maximize Match";

    // users in 30s default to "contribute all i'm allowed"
    if (window.jga.UserProfile?.savedProfile?.Age_Now <= 39) {
      defaults["401K_Contribution_Goal"] = "maximize contributions";
    }

    if (this.TaffrailAdvice.api.adviceset.id == "JUGzB62H3ERLF4P_TJ9ObJs") {
      defaults = {
        Age_Now: window.jga.UserProfile?.savedProfile?.Age_Now,
        Retirement_Income_Ratio: .8, // 80%
        "Other_Income_In_Retirement?": true,
        Other_Income_Monthly: 3000, // social security
        Rate_of_Return: .04,
        Rate_of_Return_In_Retirement: .04,
        "Consider_Inflation?": true,
        Inflation_Rate: .02,
        Years_In_Retirement: 25, // life expectancy 90
        "401K_Bonus_to_Consider?": false
      }
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

      const { variables_map: {
        Age_Now,
        Retirement_Year_Target,
        Retirement_Savings_Needed = { value: 0, valueFormatted: "$0" }
      } } = api;

      // must be advice
      if (api.display._isLast) {
        // since it's "last", hide the question.
        // $(".advice").slideUp(300);

        // override "display" with Advice
        api.display.advice = api.recommendations["Our Advice"] || [api.display];

        if (this.TaffrailAdvice.api.adviceset.id == "JUGzB62H3ERLF4P_TJ9ObJs") {
          api.display.advice.unshift({
            headline_html: `Est. target balance 
                            <taffrail-var data-variable-name="Retirement_Savings_Needed">${Retirement_Savings_Needed.valueFormatted}</taffrail-var>
                            at retirement`
          })
        }
      }

      $(".goal-result").show();

      // use this to use the "Grouped Advice" template
      // this.TaffrailAdvice.updateForAdvice();

      const retirement_year = `Retire in ${Retirement_Year_Target?.value || new Date().getFullYear() + (65 - Age_Now.value)}`;

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
