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

    // $("#breadcrumb").html("&nbsp;/&nbsp;Pay off debt");

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
    this.TaffrailAdvice.load(querystring, $("main.screen")).then(api => {
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
        Debt_Payment_Minimum,
        Debt_Payoff_Period,
        Debt_Payment,
        Debt_Payment_Diff,
        Debt_Interest_Paid_Diff
      } } = api;

      let period_from_now;
      if (Debt_Payoff_Period.value === null) {
        period_from_now = "You need to pay at least " + Debt_Payment_Minimum.valueFormatted + "/month";
      } else if (Debt_Payoff_Period.value <= 12) {
        period_from_now = `Goal reached in ${Debt_Payoff_Period.value.toFixed(0)} months`
      } else {
        const totalYrs = (Debt_Payoff_Period.value / 12).toFixed(0);
        period_from_now = `Goal reached in ${new Date().getFullYear() + Number(totalYrs)}`
      }

      let tips = [];

      // suggest Tip for user to pay off debt faster
      if (Debt_Payoff_Period.value >= 6) {
        const increasedPayment = Debt_Payment.value + Debt_Payment_Diff.value;
        tips.push({
          tip: `Adding ${Debt_Payment_Diff.valueFormatted} to your payment, 
                you will pay off your debt in half the time and save ${Debt_Interest_Paid_Diff.valueFormatted} in interest.`,
          action: `Debt_Payment=${increasedPayment}` // querystring format
        })
      }

      // minimum payment required
      if (Debt_Payoff_Period.value === null) {
        tips = [{
          tip: `Make at least the ${Debt_Payment_Minimum.valueFormatted} minimum payment`,
          action: `Debt_Payment=${Debt_Payment_Minimum.value}` // querystring format
        }]
      }

      const goal = {
        period_from_now,
        tips
      }
      api.display.goal = goal;

      const str = Handlebars.compile($("#tmpl_advice_pay_debt").html())(api);
      this.TaffrailAdvice.$advice.html(str);
    }

  }
}
