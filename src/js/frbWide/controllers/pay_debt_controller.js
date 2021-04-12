import _ from "lodash";
import { Controller } from "stimulus";
import TaffrailAdvice from "../taffrailapi";
import Turbolinks from "turbolinks";
import qs from "querystring";
import Handlebars from "handlebars";
export default class extends Controller {
  static targets = ["title"];
  // static values = { id: String };

  connect() {
    // console.log("CONNECTED pay debt")
  }

  initialize() {
    // advicsetId = this.idValue

    this.TaffrailAdvice = new TaffrailAdvice();
    this.TaffrailAdvice.init();

    // when data is updated after page-load, use this fn
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
    this.TaffrailAdvice.load(querystring).then(api => {
      // DOM updates
      this.TaffrailAdvice.updateFn(api, "initial page load");
    });
  }

  /**
   * Update 3 panes. This fn is called each time the API updates.
   */
  updatePanes() {
    this.titleTarget.innerHTML = this.TaffrailAdvice.api.adviceset.title;
    this.TaffrailAdvice.mapData();
    this.TaffrailAdvice.updateMainPane();
    this.updateMainPane();
    this.TaffrailAdvice.updateAssumptionsList();
  }

  updateMainPane() {
    const { api } = this.TaffrailAdvice;
    // render
    if (api.display.type != "INPUT_REQUEST") {
      // must be advice
      if (api.display._isLast) {
        // override "display" with Advice
        const rec = _.cloneDeep(api.recommendations["Our Advice"] || []);
        api.display.advice = rec.map(a => { a.headline_html = `<p class="lead">${a.headline_html}</p>`; return a; });
      }

      // use this to use the "Grouped Advice" template
      this.TaffrailAdvice.updateForAdvice();

      const { variables_map: {
        Monthly_Interest_Amt = { value: null, valueFormatted: "" },
        Debt_Payoff_Period = { value: null },
      } } = api;

      let period_from_now;
      if (Debt_Payoff_Period.value === null) {
        period_from_now = "You need to pay at least " + Monthly_Interest_Amt.valueFormatted + "/month";
      } else if (Debt_Payoff_Period.value <= 12) {
        period_from_now = `Goal reached in ${Debt_Payoff_Period.value.toFixed(0)} months`
      } else {
        const totalYrs = (Debt_Payoff_Period.value / 12).toFixed(0);
        period_from_now = `Goal reached in ${new Date().getFullYear() + Number(totalYrs)}`
      }

      const goal = {
        period_from_now,
        canOptimize: true
      }
      api.display.goal = goal;

      // export data setup for saving to goal
      api.save_to_goal = {
        advice: api.display.advice.concat(api.recommendations["Reaching Your Goal"] || []),
        goal,
        assumptions: api.assumptions
      };

      const str = Handlebars.compile($("#tmpl_advice_pay_debt").html())(api);
      this.TaffrailAdvice.$advice.html(str);
    }

  }
}
