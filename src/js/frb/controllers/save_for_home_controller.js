import _ from "lodash";
import { Controller } from "stimulus";
import TaffrailAdvice from "../taffrailapi";
import Turbolinks from "turbolinks";
import qs from "querystring";
import Handlebars from "handlebars";
import pluralize from "pluralize";
export default class extends Controller {
  // static targets = ["goal"];
  // static values = { id: String };

  connect() {

  }

  initialize() {
    // track state for goal
    this.reachedGoal = false;

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
      Mortgage_Down_Payment_Pct: .25,
      Mortgage_Interest_Rate: .03,
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
    // title
    // const { variables_map: { Home_Price, Home_Price_Original, Home_Purchase_Time_Frame = { value: 0 } } } = api;
    // const price = Home_Price_Original?.valueFormatted || Home_Price?.valueFormatted;
    // const timeFrameYrs = new Date().getFullYear() + Home_Purchase_Time_Frame.value;
    // this.goalTarget.innerHTML = `I want to buy a home for <span class="text-secondary">${price}</span> by <span class="text-secondary">${timeFrameYrs}</span>`;
    // render
    if (api.display.type == "INPUT_REQUEST") {
      // $(".advice").slideDown(300);
      this.TaffrailAdvice.updateForInputRequest();
    } else {
      // must be advice
      if (api.display._isLast) {
        // since it's "last", hide the question.
        // $(".advice").slideUp(300);

        api.display.advice = api.recommendations["Recommendations"] || [api.display];
      }
      $(".goal-result").show();

      // use this to use the "Grouped Advice" template
      // this.TaffrailAdvice.updateForAdvice();

      this.updateTips();

      const str = Handlebars.compile($("#tmpl_advice_save_home").html())(api);
      this.TaffrailAdvice.$advice.html(str);

      // $(".advice").find("a[data-action='save-goal']").toggle(this.reachedGoal);
    }

  }

  // eslint-disable-next-line complexity
  updateTips() {
    const { api } = this.TaffrailAdvice;
    const { variables_map: {
      "Can_Afford_House?": Can_Afford_House = { value: false },
      Goal_HomeSave_Adjust_DownPayment = { value: 0 },
      Goal_HomeSave_Adjust_Price,
      Goal_HomeSave_Adjust_Savings,
      Goal_HomeSave_Adjust_Time,
      Home_Price = { value: 0 },
      Home_Purchase_Time_Frame = { value: 0 },
      Mortgage_Down_Payment_Savings_Current = { value: 0 },
      Mortgage_Down_Payment_Savings_Monthly = { value: 0 },
      Mortgage_Down_Payment_Savings_Monthly_Needed: DP_Savings_Monthly_Needed = { value: 0 },
      Mortgage_Down_Payment_Pct = { value: 0 },
      Time_Frame_Needed = { value: 0 },
      Time_Frame_Desired = { value: 0 },
      // Home_Price
    } } = api;

    try {
      let period_from_now = "";
      this.reachedGoal = Can_Afford_House.value && Time_Frame_Needed.value <= Time_Frame_Desired.value;
      const cannotAffordHouse = !Can_Afford_House.value;
      if (cannotAffordHouse) {
        this.reachedGoal = false;
      }

      if (cannotAffordHouse) {
        period_from_now = "This goal is out of reach";
      } else {
        if (this.reachedGoal) {
          const totalYrs = (Time_Frame_Needed.value / 12).toFixed(0);
          period_from_now += `<span class='text-success'>You got this in ${pluralize("year", totalYrs, true)}!</span>`;
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
          const aboveOrBelow = (Mortgage_Down_Payment_Savings_Monthly.value < DP_Savings_Monthly_Needed.value) ? "below" : "above";
          // remove 1st element from array, advice we don't want to display when goal has not been reached
          // api.display.advice.shift();
          // insert new "you're not there yet..." advice at top of display stack
          api.display.advice.unshift({
            headline_html: "<h6 class='text-uppercase text-secondary' style='font-size:90%;'>How to reach your goal</h6>"
          });
          api.display.advice.unshift({
            headline_html: `By saving
              <taffrail-var data-variable-name="Mortgage_Down_Payment_Savings_Monthly">${Mortgage_Down_Payment_Savings_Monthly.valueFormatted}</taffrail-var>
              per month you are <strong>${aboveOrBelow}</strong> the
              <taffrail-var data-variable-name="Mortgage_Down_Payment_Savings_Monthly_Needed">${DP_Savings_Monthly_Needed.valueFormatted}</taffrail-var>
              required to afford the 
              <taffrail-var data-variable-name="Mortgage_Down_Payment_Pct">${Mortgage_Down_Payment_Pct.valueFormatted}</taffrail-var>
              down payment on your 
              <taffrail-var data-variable-name="Home_Price">${Home_Price.valueFormatted}</taffrail-var>
              home in 
              <taffrail-var data-variable-name="Home_Purchase_Time_Frame">${pluralize("year", Home_Purchase_Time_Frame.value, true)}</taffrail-var>.`,
          });
        }
      }

      const tip_header = "Getting into this home";
      const tips = [];

      // suggest Tip for user to buy house sooner
      if (!this.reachedGoal) {
        if (Can_Afford_House.value) {
          const totalYrs = (Time_Frame_Needed.value / 12).toFixed(0);
          tips.push({
            tip: `Use projected timeline of ${new Date().getFullYear() + Number(totalYrs)}`,
            action: `Home_Purchase_Time_Frame=${Number(totalYrs) + 1}` // querystring format
          });
        }
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
        if (Goal_HomeSave_Adjust_Time){
          const adjustmentYears = Number(Math.ceil(Goal_HomeSave_Adjust_Time.value / 12).toFixed(0));
          const totalAdjustYears = adjustmentYears + (Time_Frame_Desired.value/12);
          tips.push({
            tip: `Extend your time frame by ${adjustmentYears} years`,
            action: `Home_Purchase_Time_Frame=${totalAdjustYears}` // querystring format
          });
        }
      }

      const goal = {
        period_from_now,
        tip_header,
        tips
      }
      api.display.goal = goal;

      // export data setup for saving to goal
      api.save_to_goal = {
        advice: [].concat(api.display.advice).map(a => { return _.omit(a, "advice"); }),
        goal
      };

    } catch (e) {
      api.display.goal = {}
      console.error(e);
      $(document).trigger("pushnotification", ["goal_change", { message: e.message }]);
    }
  }
}
