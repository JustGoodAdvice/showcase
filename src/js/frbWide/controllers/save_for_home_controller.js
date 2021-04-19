import _ from "lodash";
import { Controller } from "stimulus";
import TaffrailAdvice from "../taffrailapi";
import Turbolinks from "turbolinks";
import qs from "querystring";
import Handlebars from "handlebars";
import pluralize from "pluralize";
export default class extends Controller {
  static targets = ["title", "goal"];
  // static values = { id: String };

  connect() {

  }

  initialize() {
    // track state for goal
    this.reachedGoal = false;

    // advicsetId = this.idValue

    this.TaffrailAdvice = new TaffrailAdvice();
    this.TaffrailAdvice.init();

    // when data is updated after page-load, use this fn
    this.TaffrailAdvice.$loadingContainer = $(".advice-outer-container");
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
      Mortgage_Down_Payment_Pct: .25,
      Mortgage_Interest_Rate: .03,
      State: "CA"
    }
    const data = qs.stringify(_.assign(defaults, qs.parse(querystring)));
    this.TaffrailAdvice.load(data).then(api => {
      // DOM updates
      this.TaffrailAdvice.updateFn(api, "initial page load");
    });
  }

  /**
   * Update 3 panes. This fn is called each time the API updates.
   */
  updatePanes() {
    this.titleTarget.innerHTML = this.TaffrailAdvice.api?.adviceset?.title || "";
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
        api.display.advice = [];
      }

      // use this to use the "Grouped Advice" template
      this.TaffrailAdvice.updateForAdvice();

      this.updateTips();

      const str = Handlebars.compile($("#tmpl_advice_save_home").html())(api);
      this.TaffrailAdvice.$advice.html(str);
    }

  }

  // eslint-disable-next-line complexity
  updateTips() {
    const { api } = this.TaffrailAdvice;
    const { variables_map: {
      "Can_Afford_House?": Can_Afford_House = { value: false },
      Home_Price = { value: 0 },
      Home_Purchase_Time_Frame = { value: 0 },
      Mortgage_Down_Payment_Savings_Monthly = { value: 0 },
      Mortgage_Down_Payment_Savings_Monthly_Needed: DP_Savings_Monthly_Needed = { value: 0 },
      Mortgage_Down_Payment_Pct = { value: 0 },
      Time_Frame_Needed = { value: 0 },
      Time_Frame_Desired = { value: 0 },
      // Home_Price
    } } = api;

    let canOptimize = true;

    try {
      let period_from_now = "";
      this.reachedGoal = Can_Afford_House.value && Time_Frame_Needed.value <= Time_Frame_Desired.value;
      const cannotAffordHouse = !Can_Afford_House.value;
      if (cannotAffordHouse) {
        this.reachedGoal = false;
        canOptimize = false;
      }

      if (cannotAffordHouse) {
        period_from_now = api.recommendations["Our Advice"][0].headline;
        api.display.advice = [{
          ...api.recommendations["Our Advice"][0],
          // when you cannot afford the house, the period_from_now is set to headline
          // so we need to change the headline HTML to be the summary
          headline_html: `<p class="lead">${api.recommendations["Our Advice"][0].summary_html}</p>`
        }];
        
        // api.display.advice.shift();
        // api.display.advice.unshift({
        //   headline_html: `<p class="lead">Saving
        //       ${this.TaffrailAdvice.tfvar(Mortgage_Down_Payment_Savings_Monthly)}
        //       per month is not enough to meet your goal of 
        //       buying a ${this.TaffrailAdvice.tfvar(Home_Price)} home in
        //       ${this.TaffrailAdvice.tfvar(Home_Purchase_Time_Frame, pluralize("year", Home_Purchase_Time_Frame.value, true))}.</p>`,
        // });

      } else {
        if (this.reachedGoal) {
          const totalYrs = (Time_Frame_Needed.value / 12).toFixed(0);
          period_from_now += `You got this in ${pluralize("year", totalYrs, true)}!`;
        } else {
          if (Time_Frame_Needed.value && Time_Frame_Needed.value > 0) {
            if (Time_Frame_Needed.value <= 12) {
              period_from_now += `Goal reached in ${Time_Frame_Needed.value.toFixed(0)} months`
            } else {
              const totalYrs = (Time_Frame_Needed.value / 12).toFixed(0);
              period_from_now += `Goal reached in ${new Date().getFullYear() + Number(totalYrs)}`
            }
          }

          // not reaching the goal
          if (Mortgage_Down_Payment_Savings_Monthly.value === null) {
            Mortgage_Down_Payment_Savings_Monthly.value = 0;
          }
          let aboveOrBelow = (Mortgage_Down_Payment_Savings_Monthly.value < DP_Savings_Monthly_Needed.value) ? "below" : "above";
          if (Mortgage_Down_Payment_Savings_Monthly.value.toFixed(0) == DP_Savings_Monthly_Needed.value.toFixed(0)) {
            aboveOrBelow = "at";
          }

          api.display.advice.unshift({
            headline_html: `<p class="lead">By saving
              ${this.TaffrailAdvice.tfvar(Mortgage_Down_Payment_Savings_Monthly)}
              per month you are <strong>${aboveOrBelow}</strong> the
              ${this.TaffrailAdvice.tfvar(DP_Savings_Monthly_Needed)}
              required to afford the 
              ${this.TaffrailAdvice.tfvar(Mortgage_Down_Payment_Pct)}
              down payment on your 
              ${this.TaffrailAdvice.tfvar(Home_Price)}
              home in 
              ${this.TaffrailAdvice.tfvar(Home_Purchase_Time_Frame, pluralize("year", Home_Purchase_Time_Frame.value, true))}.</p>`,
          });
        }
      }

      const goal = {
        period_from_now,
        canOptimize
      }
      api.display.goal = goal;

      // export data setup for saving to goal
      let adv = _.cloneDeep(api.display.advice);
      if (cannotAffordHouse) {
        adv[0].headline_html = api.recommendations["Our Advice"][0].headline_html;
        adv = adv.concat([{
          // mock up a "reaching your goal" advice
          id: _.uniqueId(`${api.recommendations["Our Advice"][0].id}____`),
          headline_html: api.recommendations["Our Advice"][0].summary_html
        }]);
      }
      api.save_to_goal = {
        advice: [].concat(adv).concat(api.recommendations["Reaching Your Goal"] || []),
        goal,
        assumptions: api.assumptions
      };

    } catch (e) {
      api.display.goal = {}
      console.error(e);
      $(document).trigger("pushnotification", ["goal_change", { message: e.message }]);
    }
  }
}
