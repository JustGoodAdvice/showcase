import _ from "lodash";
import { Controller } from "stimulus";
import TaffrailAdvice from "../taffrailapi";
import Turbolinks from "turbolinks";
import qs from "querystring";
import Handlebars from "handlebars";
import numeral from "numeral";

export default class extends Controller {
  // static targets = ["title", "description"];
  // static values = { id: String };

  connect() {
    // console.log("CONNECTED pay debt")
  }

  initialize() {
    // track state for goal
    this.reachedGoal = false;
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

  // eslint-disable-next-line complexity
  updateMainPane() {
    const { api } = this.TaffrailAdvice;
    // render
    if (api.display.type == "INPUT_REQUEST") {
      // $(".advice").slideDown(300);
      this.TaffrailAdvice.updateForInputRequest();
    } else {

      const { variables_map: {
        "401K_Contribution_Max_Pct": _401K_Contribution_Max_Pct = { value: 0 },
        "401K_Contribution_Current_Pct": _401K_Contribution_Current_Pct = { value: 0 },
        "IRA?": hasIra = { value: false },
        Current_Monthly_Savings = { value: 0 },
        Monthly_IRA_Contribution_Current = { value: 0 },
        Monthly_IRA_Contribution_Needed = { value: 0 },
        Monthly_Savings_Needed = { value: 0 },
        Monthly_Retirement_Savings_Other_Current = { value: 0 },
        Monthly_Retirement_Savings_Other_Needed = { value: 0 },
        Future_Value_Of_Savings_Total = { value: 0 },
        Retirement_Age = { value: 65 },
        // Years_In_Retirement = { value: 25 },
        Retirement_Year_Target,
        Retirement_Savings_Needed = { value: 0, valueFormatted: "$0" }
      } } = api;

      // must be advice
      if (api.display._isLast) {
        // override "display" with Advice
        api.display.advice = api.recommendations["Our Advice"] || [api.display];
      }

      $(".goal-result").show();

      // get percent difference between what is needed and what client is saving
      // anything less than 3% difference is "on track"
      const [RSN, FVT] = [Retirement_Savings_Needed.value, Future_Value_Of_Savings_Total.value]
      const pctDiff = 100 * Math.abs((RSN - FVT) / ((RSN + FVT) / 2));
      this.reachedGoal = pctDiff <= 3;

      const retirement_year = `Retire in ${Retirement_Year_Target?.value}`;

      const tips = [];
      let ideas = [];

      if (api.recommendations["Your Deferral Elections"] && api.recommendations["Your Deferral Elections"].length) {
        ideas = ideas.concat(api.recommendations["Your Deferral Elections"].map(adv => {
          return {
            tip: adv.headline_html || adv.headline,
            action: "#"
          }
        }));
      }

      if (api.recommendations["Our Thinking"] && api.recommendations["Our Thinking"].length) {
        ideas = ideas.concat(api.recommendations["Our Thinking"].map(adv => {
          return {
            tip: adv.headline_html || adv.headline,
            action: "#"
          }
        }));
      }

      if (api.recommendations["Recommendations"] && api.recommendations["Recommendations"].length) {
        ideas = ideas.concat(api.recommendations["Recommendations"].map(adv => {
          return {
            tip: adv.headline_html || adv.headline,
            action: "#"
          }
        }));
      }

      // not reaching the goal
      if (!this.reachedGoal) {
        const aboveOrBelow = (Current_Monthly_Savings.value < Monthly_Savings_Needed.value) ? "below" : "above";
        // remove 1st element from array, advice we don't want to display when goal has not been reached
        api.display.advice.shift();
        // insert new "you're not there yet..." advice at top of display stack
        api.display.advice.unshift({
          headline_html: "<h6 class='text-uppercase text-secondary' style='font-size:90%;'>How to reach your goal</h6>"
        });
        api.display.advice.unshift({
          headline_html: `By saving 
            <taffrail-var data-variable-name="Current_Monthly_Savings">${Current_Monthly_Savings.valueFormatted}</taffrail-var> 
            per month you are <strong>${aboveOrBelow}</strong> the
            <taffrail-var data-variable-name="Monthly_Savings_Needed">${Monthly_Savings_Needed.valueFormatted}</taffrail-var>
             required to retire comfortably by age 
             <taffrail-var data-variable-name="Retirement_Age">${Retirement_Age.value}</taffrail-var>, in 
             <taffrail-var data-variable-name="Retirement_Year_Target">${Retirement_Year_Target.value}</taffrail-var>.`,
        });

        ideas = ideas.concat([{
          tip: `You're off track by ${numeral(pctDiff/100).format("0%")}`,
          action: "#"
        }]);

        // not maxing 401k?
        if (_401K_Contribution_Current_Pct.value < _401K_Contribution_Max_Pct.value) {
          tips.push({
            tip: `Max your 401(k) by contributing ${_401K_Contribution_Max_Pct.valueFormatted} of your pay`,
            action: `401K_Contribution_Current_Pct=${_401K_Contribution_Max_Pct.value}` // querystring format
          });
        }

        // no IRA?
        const hasIraRuleId = "rule_uOCZo71UpkvkFNjUwuuqV_selection";
        if (!hasIra.value) {
          tips.push({
            tip: `Contribute ${Monthly_IRA_Contribution_Needed.valueFormatted}/month to an IRA`,
            action: `${hasIraRuleId}=1&Monthly_IRA_Contribution_Current=${Monthly_IRA_Contribution_Needed.value}` // querystring format
          });
        } else {
          // have IRA but not maxing it?
          if (Monthly_IRA_Contribution_Current.value < Monthly_IRA_Contribution_Needed.value) {
            const howMuchMore = Monthly_IRA_Contribution_Needed.value - Monthly_IRA_Contribution_Current.value;
            tips.push({
              tip: `Max your IRA with <strong>${numeral(howMuchMore).format("$0,0")} more</strong> per month`,
              action: `${hasIraRuleId}=1&Monthly_IRA_Contribution_Current=${Monthly_IRA_Contribution_Needed.value}` // querystring format
            });
          }
        }

        // not saving anything extra?
        if (Monthly_Retirement_Savings_Other_Current.value < Monthly_Retirement_Savings_Other_Needed.value) {
          tips.push({
            tip: `Contribute ${Monthly_Retirement_Savings_Other_Needed.valueFormatted} to other savings`,
            action: `Monthly_Retirement_Savings_Other_Current=${Monthly_Retirement_Savings_Other_Needed.value}` // querystring format
          });
        }
      }

      const goal = {
        retirement_year,
        tips,
        ideas
      }
      api.display.goal = goal;

      // export data setup for saving to goal
      api.save_to_goal = {
        advice: api.display.advice.map(a => { return _.omit(a, "advice"); }),
        goal
      };

      const str = Handlebars.compile($("#tmpl_advice_save_retirement").html())(api);
      this.TaffrailAdvice.$advice.html(str);

      // $(".advice").find("a[data-action='save-goal']").toggle(this.reachedGoal);
    }

  }
}
