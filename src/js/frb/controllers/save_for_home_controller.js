import _ from "lodash";
import { Controller } from "stimulus";
import TaffrailAdvice from "../taffrailapi";
import Turbolinks from "turbolinks";
import qs from "querystring";
import Handlebars from "handlebars";
export default class extends Controller {
  // static targets = ["timeframeInYears"];
  // static values = { id: String };

  connect() {

  }

  initialize() {
    // advicsetId = this.idValue

    // $("#breadcrumb").html("&nbsp;/&nbsp;Save for a home");

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
      Homeowner_Association_Fees: 0,
      Homeowner_Insurance_Costs_Monthly: 1000/12,
      Home_Property_Taxes: 5000,
      Mortgage_Down_Payment_Pct: .2,
      Mortgage_Insurance_Per_Month: 0,
      Mortgage_Interest_Rate: .03,
      Mortgage_Term_Years: 30,
    }
    const data = qs.stringify(_.extend(defaults, qs.parse(querystring)));
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
      }
      $(".goal-result").show();

      // use this to use the "Grouped Advice" template
      // this.TaffrailAdvice.updateForAdvice();

      const { variables_map: {
        "Can_Afford_House?": Can_Afford_House,
        Goal_HomeSave_Adjust_DownPayment,
        Goal_HomeSave_Adjust_Price,
        Goal_HomeSave_Adjust_Savings,
        Mortgage_Down_Payment_Savings_Current,
        Time_Frame_Needed,
        Time_Frame_Desired,
      } } = api;

      let period_from_now;

      if (Time_Frame_Needed.value <= 12) {
        period_from_now = `Goal reached in ${Time_Frame_Needed.value.toFixed(0)} months`
      } else {
        const totalYrs = (Time_Frame_Needed.value / 12).toFixed(0);
        period_from_now = `Goal reached in ${new Date().getFullYear() + Number(totalYrs)}`
      }

      const tip_header = new Date().getFullYear() + (Time_Frame_Desired.value / 12);
      const tips = [];

      // suggest Tip for user to pay off debt faster
      const reachedGoal = Time_Frame_Needed.value < Time_Frame_Desired.value;
      if (!reachedGoal) {
        const totalYrs = (Time_Frame_Needed.value / 12).toFixed(0);
        tips.push({
          tip: `Use projected timeline of ${new Date().getFullYear() + Number(totalYrs)}`,
          action: `Home_Purchase_Time_Frame=${totalYrs}` // querystring format
        });
        tips.push({
          tip: `Lower your target price to ${Goal_HomeSave_Adjust_Price.valueFormatted}`,
          action: `Home_Price=${Goal_HomeSave_Adjust_Price.value}` // querystring format
        });
        tips.push({
          tip: `Cut back on spending to save ${Goal_HomeSave_Adjust_Savings.valueFormatted}`,
          action: `Mortgage_Down_Payment_Savings_Monthly=${Goal_HomeSave_Adjust_Savings.value}` // querystring format
        });
        tips.push({
          tip: `Contribute an additional ${Goal_HomeSave_Adjust_DownPayment.valueFormatted}`,
          action: `Mortgage_Down_Payment_Savings_Current=${Mortgage_Down_Payment_Savings_Current.value + Goal_HomeSave_Adjust_DownPayment.value}` // querystring format
        });
      }

      const goal = {
        period_from_now,
        tip_header,
        tips
      }
      api.display.goal = goal;

      const str = Handlebars.compile($("#tmpl_advice_save_home").html())(api);
      this.TaffrailAdvice.$advice.html(str);
    }

  }
}
