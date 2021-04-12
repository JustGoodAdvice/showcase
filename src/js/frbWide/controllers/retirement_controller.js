import _ from "lodash";
import { Controller } from "stimulus";
import TaffrailAdvice from "../taffrailapi";
import Turbolinks from "turbolinks";
import qs from "querystring";
import Handlebars from "handlebars";
// import numeral from "numeral";

export default class extends Controller {
  static targets = ["title"];
  // static values = { id: String };

  connect() {
    // console.log("CONNECTED retirement")
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
      Age_Now: window.jga.UserProfile?.savedProfile?.Age_Now,
      Retirement_Income_Ratio: .8, // 80%
      "Other_Income_In_Retirement?": true,
      Other_Income_Monthly: 3000, // social security
      Rate_of_Return: .04,
      Rate_of_Return_In_Retirement: .04,
      "Consider_Inflation?": true,
      Inflation_Rate: .02,
      Years_In_Retirement: 25, // life expectancy 90
      "401K_Bonus_to_Consider?": false,
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
    this.titleTarget.innerHTML = this.TaffrailAdvice.api.adviceset.title;
    this.TaffrailAdvice.mapData();
    this.TaffrailAdvice.updateMainPane();
    this.updateMainPane();
    this.TaffrailAdvice.updateAssumptionsList();
  }

  // eslint-disable-next-line complexity
  updateMainPane() {
    const { api } = this.TaffrailAdvice;
    // render
    if (api.display.type != "INPUT_REQUEST") {
      const { variables_map: {
        "401K_Contribution_Max_Pct": _401K_Contribution_Max_Pct = { value: 0 },
        "401K_Contribution_Current_Pct": _401K_Contribution_Current_Pct = { value: 0 },
        Current_Monthly_Savings = { value: 0 },
        Monthly_Savings_Needed = { value: 0 },
        Future_Value_Of_Savings_Total = { value: 0 },
        Retirement_Age = { value: 65 },
        Retirement_Year_Target,
        Retirement_Savings_Needed = { value: 0, valueFormatted: "$0" }
      } } = api;

      let canOptimize = true;

      // must be advice
      if (api.display._isLast) {
        // override "display" with Advice
        api.display.advice = [];
      }

      // get percent difference between what is needed and what client is saving
      // anything less than 3% difference is "on track"
      const [RSN, FVT] = [Retirement_Savings_Needed.value, Future_Value_Of_Savings_Total.value]
      const pctDiff = 100 * (FVT - RSN) / ((FVT + RSN) / 2);
      this.reachedGoal = pctDiff >= -3;

      const retirement_year = `Retire in ${Retirement_Year_Target?.value}`;
      const aboveOrBelow = (Current_Monthly_Savings.value < Monthly_Savings_Needed.value) ? "below" : "above";

      if (this.reachedGoal && Current_Monthly_Savings.value > Monthly_Savings_Needed.value) {
        if (Monthly_Savings_Needed.value > 0) {
          // remove 1st element from array, advice we don't want to display when goal has not been reached
          // api.display.advice.shift();
          // insert "you're already there.."
          canOptimize = false;
          api.display.advice.unshift({
            headline_html: `<p class="lead">By saving
              ${this.TaffrailAdvice.tfvar(Current_Monthly_Savings)}
              per month you are <strong>${aboveOrBelow}</strong> the
              ${this.TaffrailAdvice.tfvar(Monthly_Savings_Needed)}
              required to retire comfortably by age 
              ${this.TaffrailAdvice.tfvar(Retirement_Age)}, in
              ${this.TaffrailAdvice.tfvar(Retirement_Year_Target)}.</p>`,
          });
        } else {
          canOptimize = false;
          api.display.advice.unshift({
            headline_html: `<p class="lead">You are saving enough to retire comfortably by age 
              ${this.TaffrailAdvice.tfvar(Retirement_Age)}, in
              ${this.TaffrailAdvice.tfvar(Retirement_Year_Target)}.</p>`
          });
        }
      }

      // not reaching the goal
      if (!this.reachedGoal) {
        // remove 1st element from array, advice we don't want to display when goal has not been reached
        // api.display.advice.shift();
        api.display.advice.unshift({
          headline_html: `<p class="lead">By saving
             ${this.TaffrailAdvice.tfvar(Current_Monthly_Savings)}
            per month you are <strong>${aboveOrBelow}</strong> the
            ${this.TaffrailAdvice.tfvar(Monthly_Savings_Needed)}
             required to retire comfortably by age 
             ${this.TaffrailAdvice.tfvar(Retirement_Age)}, in
             ${this.TaffrailAdvice.tfvar(Retirement_Year_Target)}.</p>`,
        });
      }

      const goal = {
        retirement_year,
        canOptimize
      }
      api.display.goal = goal;

      // export data setup for saving to goal
      api.save_to_goal = {
        advice: api.display.advice.concat(api.recommendations["Reaching Your Goal"] || []),
        goal,
        assumptions: api.assumptions
      };

      const str = Handlebars.compile($("#tmpl_advice_save_retirement").html())(api);
      this.TaffrailAdvice.$advice.html(str);

      // $(".advice").find("a[data-action='save-goal']").toggle(this.reachedGoal);
    }

  }
}
