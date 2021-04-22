/* eslint-disable no-console */
import _ from "lodash";
import pluralize from "pluralize";
import store from "store";
import Handlebars from "handlebars";
import numeral from "numeral";
import qs from "querystring";
import copy from "clipboard-copy";
import async from "async-es";
export default class {
  constructor(profile, isFirstLoad = false) {
    if (!profile) {
      $("#budget_start").toggle(true);
      return;
    }
    this.profile = profile;

    console.log(`Profile for "${this.profile._name}" present, current state is:`, this.profile)

    this.STORAGE_KEY = "frb_user_goals_" + this.profile._name;

    this.allVariables = [];
    this.formulaDebug = [];

    if (isFirstLoad) {
      this.handleClickSaveGoal();
      this.handleClickDeleteGoal();
      this.handleClickResetGoals();
      this.handleClickOptimizeGoals();
      this.handleCollapseAssumptionGroup();
      this.handleClickAssumption();
      this.activateCurrentGoals();
      this.renderBudgetAndGoals();
    } else {
      this.activateCurrentGoals();
      this.renderBudgetAndGoals();
    }

    // profile controller accesses this
    window.goals = this;
  }

  get savedGoals() {
    const g = store.get(this.STORAGE_KEY, []);
    return g;
  }

  set savedGoals(arr) {
    store.set(this.STORAGE_KEY, arr);
    // console.log("SAVING GOAL>>>>", arr);
    this.activateCurrentGoals();
  }

  get goalCount() {
    const ct = this.savedGoals.length;
    if (this.profile && this.profile.budgetcreated) {
      return ct - 1; // profile is a "goal" we need to discount
    }
    return ct;
  }

  prioritzeGoals() {
    const saveForHome = this.getGoalByName("save-for-home");
    const payoffDebt = this.getGoalByName("pay-debt");
    const saveRetirement = this.getGoalByName("retirement");
    const debtIsCreditCardDebt = this.isDebtCreditCardDebt(payoffDebt);

    // debt, retirement, home
    const prioritized = [];
    // credit card debt is first, all other debt is last
    if (payoffDebt && debtIsCreditCardDebt) { prioritized.push(payoffDebt); }
    if (saveRetirement) { prioritized.push(saveRetirement); }
    if (saveForHome) { prioritized.push(saveForHome); }
    if (payoffDebt && !debtIsCreditCardDebt) { prioritized.push(payoffDebt); }
    return prioritized;
  }

  handleClickSaveGoal() {
    $(document).on("click", "a[data-action='save-goal']", e => {
      e.preventDefault();
      const $el = $(e.currentTarget);
      $el.prop("disabled",true).addClass("disabled").text("Saved!");
      const { controller: goalName } = $el.parents("div[data-controller]").data();
      this.saveGoal(goalName);
    });
  }

  handleClickDeleteGoal() {
    $(document).on("click", "a[data-action='delete-goal']", e => {
      e.preventDefault();
      const $el = $(e.currentTarget);
      const { id } = $el.data();
      this.deleteGoal(id);
      this.emit("goals", { message: "Goal deleted!" });
      this.renderBudgetAndGoals();
    });
  }

  handleClickResetGoals() {
    $(document).on("click", "a[data-action='reset-goals']", e => {
      e.preventDefault();
      // const $el = $(e.currentTarget);
      this.resetGoals();
      this.renderBudgetAndGoals();
    });
  }

  handleClickOptimizeGoals() {
    $(document).on("click", "a[data-action='optimize-goals']", e => {
      e.preventDefault();
      this._OPTIMIZE();
    });
  }

  activateCurrentGoals() {
    if (!this.profile) { return; }
    $("body")
      .find("a.active[data-select-persona]")
      .next("span[data-profile-selected-goals]")
      .html(`&nbsp;(${pluralize("goal", this.goalCount, true)}, <a href="#" data-action="reset-goals" data-toggle="tooltip" title="Delete all goals">reset</a>)`);
  }

  // eslint-disable-next-line complexity
  _OPTIMIZE() {
    // users can only "optimize" when goals.length > 1 (button is hidden from UX otherwise)
    const queue = [];
    const isOverBudget = this.availableCash < 0;
    const saveForHome = this.getGoalByName("save-for-home");
    const payoffDebt = this.getGoalByName("pay-debt");
    const saveRetirement = this.getGoalByName("retirement");
    const debtIsCreditCardDebt = this.isDebtCreditCardDebt(payoffDebt);
    // RESET FORMULADEBUG
    this.formulaDebug = [];
    this.pushToFormulaDebug({
      name: "isOverBudget",
      expression: `${this.availableCash} < 0`,
      result: isOverBudget
    });

    async.series([
      // eslint-disable-next-line complexity
      (cbSeries) => {
        if (isOverBudget) {
          console.group("Over budget");
          let budget = this.availableCash;

          async.waterfall([
            (callback) => {
              // if you have a home goal, reduce this first
              if (saveForHome) {
                console.group("Save for home");
                const cost = this.getCostFor("save-for-home");
                let newMonthlyDownPaymentSavings = budget + cost;
                console.log(`Try decreasing down payment savings to $${newMonthlyDownPaymentSavings}...`);

                if (newMonthlyDownPaymentSavings < 0) {
                  // client is way over budget, can't save for house right now
                  newMonthlyDownPaymentSavings = 0;
                  console.log("Not enough budget, reducing down payment savings to ZERO");
                  console.log(`Will decrease down payment savings to $${newMonthlyDownPaymentSavings}`);
                }

                // find the home_price amount they *can* afford with new down payment
                // before running "_OPTIMIZE_REFRESH_GOAL"
                console.log(`With new down payment savings $${newMonthlyDownPaymentSavings}, how much can they afford?`);
                let newPrice;
                this._preload_goal(saveForHome, {
                  Mortgage_Down_Payment_Savings_Monthly: newMonthlyDownPaymentSavings
                }).then(preloadedData => {
                  const Goal_HomeSave_Adjust_Price = preloadedData.variables.find(v => { return v.name == "Goal_HomeSave_Adjust_Price"; });
                  newPrice = Goal_HomeSave_Adjust_Price.value;
                }).then(() => {
                  console.log(`Decreasing down payment savings to $${newMonthlyDownPaymentSavings} AND adjusting price to ${newPrice}`);
                  queue.push(this._OPTIMIZE_REFRESH_GOAL(saveForHome, {
                    Mortgage_Down_Payment_Savings_Monthly: newMonthlyDownPaymentSavings,
                    Home_Price: newPrice
                  }));

                  // if new monthly savings is 0, client is way over budget
                  // so remove the full cost of this goal (amount they're currently saving pre-opt)
                  if (newMonthlyDownPaymentSavings == 0) {
                    budget += cost;
                  } else {
                    budget += newMonthlyDownPaymentSavings;
                  }

                  console.groupEnd();
                  return callback(budget);
                });
              } else {
                return callback(budget);
              }
            }
          ], (budget) => {
            console.log(`Remaining budget: ${budget}`);
            if (budget < 0) {
              console.log(`Still over budget, ${budget} remains`);
              // reduce additional payment on CC next
              if (payoffDebt && debtIsCreditCardDebt) {
                console.group("Credit card debt");
                const {
                  Debt_Payment_Additional = { value: 0 },
                } = payoffDebt.data.variables_map;

                console.log(`${Debt_Payment_Additional.value} being paid to credit card debt.`);
                if (Debt_Payment_Additional.value > 0) {
                  const reduceBudgetBy = Debt_Payment_Additional.value;
                  console.log(`Decreasing debt additional payment to $0, down from $${Debt_Payment_Additional.value}`);
                  queue.push(this._OPTIMIZE_REFRESH_GOAL(payoffDebt, {
                    Debt_Payment_Additional: 0,
                    Debt_Payment_Is_Minimum: false
                  }));
                  budget += reduceBudgetBy;
                }
                console.groupEnd();
              }

              // reduce retirement savings next
              if (budget < 0) {
                console.log(`Still over budget, ${budget} remains`);
              }
              if (saveRetirement) {
                // const cost = this.getCostFor("retirement");
              }
            }

            console.groupEnd();
            return cbSeries();
          });
        } else {
          // under budget

          /**
           * CC debt and Retirement: pay off CC in 1/2 time and allocate rest to retirement
           */
          console.group("Under budget");
          let budget = this.availableCash;

          if (payoffDebt && debtIsCreditCardDebt) {
            const {
              // Debt_Payment = { value: 0 },
              Debt_Payment_Additional = { value: 0 },
              Debt_Payment_Diff = { value: 0 }
            } = payoffDebt.data.variables_map;

            let newPmt = Debt_Payment_Additional.value + Debt_Payment_Diff.value;

            if (newPmt > budget) {
              console.log(`Paying the suggested amount (${newPmt}) is not an option (over budget)`);
              newPmt = Debt_Payment_Additional.value + budget;
            }

            console.log(`Increasing debt additional payment to $${newPmt.toFixed(2)}`);
            queue.push(this._OPTIMIZE_REFRESH_GOAL(payoffDebt, {
              Debt_Payment_Additional: newPmt,
              Debt_Payment_Is_Minimum: false
            }));

            // subtract only the diff from the current and the suggested payment
            budget -= Number(Debt_Payment_Diff.value.toFixed(2));
          }

          // if there's enough left over, figure out how much to increase 401k contribution by
          console.log(`Remainder is $${budget}`);
          if (budget > 25) {
            // no retirement but saving for home
            // if (!saveRetirement && saveForHome) {

            // }
            if (saveRetirement) {
              console.group("Retirement");
              const {
                "401K_Deferral_Max_Pct": _401K_Contribution_Max_Pct = { value: 0 },
                "401K_Contribution_Current_Pct": _401K_Contribution_Current_Pct = { value: 0 },
                Monthly_Retirement_Savings_Other_Current = { value: 0 },
                Monthly_IRA_Contribution_Max = { value: 0 },
                Salary = { value: 0 },
              } = saveRetirement.data.variables_map;

              if (_401K_Contribution_Current_Pct.value == null) {
                _401K_Contribution_Current_Pct.value = 0;
              }

              if (Monthly_Retirement_Savings_Other_Current.value == null) {
                Monthly_Retirement_Savings_Other_Current.value = 0;
              }

              const onePctOf401kContributionMonthly = Number((Number(Salary.value) * .01 / 12).toFixed(2));

              if (_401K_Contribution_Current_Pct.value < _401K_Contribution_Max_Pct.value) {
                console.log(`Remainder is > $25 and client is not yet maxing 401k (${_401K_Contribution_Current_Pct.value} of ${_401K_Contribution_Max_Pct.value}%)`);
                let increase401kContributionBy = 0;
                let increase401kContributionPct = 0;
                while (increase401kContributionBy < (budget - onePctOf401kContributionMonthly)) {
                  increase401kContributionBy += onePctOf401kContributionMonthly;
                  increase401kContributionPct += .01;
                }
                let newContributionPct = Number(_401K_Contribution_Current_Pct.value.toFixed(2)) + increase401kContributionPct;
                console.log(`Increase 401k contribution by $${increase401kContributionBy} or ${increase401kContributionPct} to ${newContributionPct}`);

                let overMaxByPct = 0;
                let remainderToContributeToRetirement = 0;
                if (newContributionPct > Number(_401K_Contribution_Max_Pct.value.toFixed(2))) {
                  overMaxByPct = Number((newContributionPct - _401K_Contribution_Max_Pct.value).toFixed(2));
                  console.log(`...but max 401k contribution percentage over by ${overMaxByPct}`);
                }
                console.log("overMaxByPct", overMaxByPct)
                // if (overMaxByPct <= 0) {
                //   console.log(`Increase 401k contribution to ${newContributionPct}`);
                //   queue.push(this._OPTIMIZE_REFRESH_GOAL(saveRetirement, {
                //     "401K_Contribution_Current_Pct": newContributionPct
                //   }));

                //   budget -= increase401kContributionBy;
                // } else {
                // console.log("budget", budget)
                budget -= increase401kContributionBy;
                newContributionPct -= overMaxByPct;
                remainderToContributeToRetirement = (onePctOf401kContributionMonthly * overMaxByPct) * 100;
                if (remainderToContributeToRetirement == 0 && budget > 0) {
                  remainderToContributeToRetirement = budget;
                }
                // console.log("budget2", budget)
                // console.log("increase401kContributionBy", increase401kContributionBy)
                // console.log("newContributionPct", newContributionPct)
                // console.log("onePctOf401kContributionMonthly", onePctOf401kContributionMonthly)

                console.log(`401k contribution increase adjusted down because client will now max at ${newContributionPct}`);
                console.log(`Funds remaining to apply to retirement action plan: ${remainderToContributeToRetirement}`);

                const willMaxIra = remainderToContributeToRetirement > Number(Monthly_IRA_Contribution_Max.value.toFixed(2));
                if (willMaxIra) {
                  console.log(`IRA would be maxed with remainder $${remainderToContributeToRetirement} to contribute`);
                } else {
                  console.log(`IRA would NOT be maxed with remainder $${remainderToContributeToRetirement} to contribute`);
                }
                let iraContribution = remainderToContributeToRetirement;
                let otherContribution = Monthly_Retirement_Savings_Other_Current.value;
                if (willMaxIra) {
                  iraContribution = Number(Monthly_IRA_Contribution_Max.value.toFixed(2));
                  otherContribution = Number(otherContribution + (iraContribution - remainderToContributeToRetirement).toFixed(2));
                  if (isNaN(otherContribution)) {
                    otherContribution = 0;
                  }
                  console.log("willMaxIra values", otherContribution, iraContribution, remainderToContributeToRetirement)
                }

                console.log(`IRA contribution ${iraContribution}`);
                console.log(`Other savings ${otherContribution}`);

                const hasIraRuleId = "rule_uOCZo71UpkvkFNjUwuuqV_selection"; // API input
                queue.push(this._OPTIMIZE_REFRESH_GOAL(saveRetirement, {
                  "401K_Contribution_Current_Pct": newContributionPct,
                  [hasIraRuleId]: 1,
                  Monthly_IRA_Contribution_Current: iraContribution,
                  Monthly_Retirement_Savings_Other_Current: otherContribution,
                }));

                budget -= (iraContribution + otherContribution);
                // }
              } else {
                // maxed 401k, stick rest into IRA & other
                const hasIraRuleId = "rule_uOCZo71UpkvkFNjUwuuqV_selection";
                const iraContribution = budget > Monthly_IRA_Contribution_Max.value ? Monthly_IRA_Contribution_Max.value : budget;
                const otherContribution = Math.abs(budget - iraContribution);
                console.log(`401k is already maxed, apply remainder to IRA $(${iraContribution}) and other (${otherContribution})`);
                queue.push(this._OPTIMIZE_REFRESH_GOAL(saveRetirement, {
                  "401K_Contribution_Current_Pct": _401K_Contribution_Max_Pct.value,
                  [hasIraRuleId]: 1,
                  Monthly_IRA_Contribution_Current: iraContribution,
                  Monthly_Retirement_Savings_Other_Current: otherContribution,
                }));

                budget -= (iraContribution + otherContribution);
              }
              console.groupEnd();
            } else if (saveForHome) {
              console.group("Save for home");
              // const cost = this.getCostFor("save-for-home");
              const {
                Goal_HomeSave_Adjust_Savings = { value: 0 },
                Mortgage_Down_Payment_Savings_Monthly = { value: 0 },
              } = saveForHome.data.variables_map;

              console.log(`Remaining available budget is ${budget}`);
              if (budget < Goal_HomeSave_Adjust_Savings.value) {
                console.log(`Available budget is less than savings adjustment needed (${Goal_HomeSave_Adjust_Savings.value}) for home`);
                console.log(`Apply available cash $${budget} to down payment savings on top of existing $${Mortgage_Down_Payment_Savings_Monthly.value}...`);
                queue.push(this._OPTIMIZE_REFRESH_GOAL(saveForHome, {
                  Mortgage_Down_Payment_Savings_Monthly: Mortgage_Down_Payment_Savings_Monthly.value + budget
                }));
                budget = 0;
              }

              console.groupEnd();
            }
          }

          console.groupEnd();
          return cbSeries();
        }
      }
    ]).then(() => {
      Promise.all(queue).then(() => {
        window.jga.UserProfile.savedProfile = _.assign(this.profile, { optimizedOnce: true });
        this.renderBudgetAndGoals();
        this.emit("opto", { message: "Your Action Plan is optimized." });
      }).catch(err => {
        console.error(err);
        this.emit("opto", { message: err.message });
      });
    });
  }

  _OPTIMIZE_REFRESH_GOAL(goal, params = {}){
    const { id: goalId, controllerName, data } = goal;
    const $container = $(`#heading_${goalId}`); // card-header
    const $summary = $container.find("p.lead");
    $summary.html("Optimizing...");

    const currentPreOptimizedAdvice = _.first(data.save_to_goal.advice);

    // console.log(`_OPTIMIZE_REFRESH_GOAL: ${controllerName}`);
    return $.ajax({
      url: data._links.base,
      data: _.assign(data.params, params),
    }).then(api => {
      const { data } = api;

      // re-do some work taffrailapi.js is doing
      this.mapVariables(data);
      data.paramsAsQueryStr = qs.stringify(data.params);

      const answers = data.advice.filter(a => { return a.type == "INPUT_REQUEST"; });

      data.advice = data.advice.filter(a => { return a.type == "ADVICE"; });
      const groupedAdvice = _.groupBy(data.advice, (a) => {
        return (a.tagGroup) ? a.tagGroup.name : "Our Advice";
      });

      // insert mechanical text generated by retirement and home goals
      if (controllerName == "save-for-home") {
        const {
          Mortgage_Down_Payment_Savings_Monthly = { value: 0 },
          Mortgage_Down_Payment_Savings_Monthly_Needed: DP_Savings_Monthly_Needed = { value: 0 },
          Mortgage_Down_Payment_Pct = { value: 0 },
          Home_Purchase_Time_Frame = { value: 0 },
          Home_Price = { value: 0 },
        } = data.variables_map;
        // not reaching the goal
        if (Mortgage_Down_Payment_Savings_Monthly.value == null) { Mortgage_Down_Payment_Savings_Monthly.value = 0; }
        if (DP_Savings_Monthly_Needed.value == null) { DP_Savings_Monthly_Needed.value = 0; }

        let aboveOrBelow = (Mortgage_Down_Payment_Savings_Monthly.value < DP_Savings_Monthly_Needed.value) ? "below" : "above";
        if (Mortgage_Down_Payment_Savings_Monthly.value.toFixed(0) == DP_Savings_Monthly_Needed.value.toFixed(0)) {
          aboveOrBelow = "at";
        }

        groupedAdvice["Our Advice"].unshift({
          headline_html: `<p class="lead">By saving
              ${this.tfvar(Mortgage_Down_Payment_Savings_Monthly)}
              per month you are <strong>${aboveOrBelow}</strong> the
              ${this.tfvar(DP_Savings_Monthly_Needed)}
              required to afford the 
              ${this.tfvar(Mortgage_Down_Payment_Pct)}
              down payment on your 
              ${this.tfvar(Home_Price)}
              home in 
              ${this.tfvar(Home_Purchase_Time_Frame, pluralize("year", Home_Purchase_Time_Frame.value, true))}.</p>`,
        });
      }

      if (controllerName == "retirement") {
        let reachedGoal = false;
        const { variables_map: {
          Current_Monthly_Savings = { value: 0 },
          Monthly_Savings_Needed = { value: 0 },
          Future_Value_Of_Savings_Total = { value: 0 },
          Retirement_Age = { value: 65 },
          Retirement_Year_Target,
          Retirement_Savings_Needed = { value: 0, valueFormatted: "$0" }
        } } = data;
        // get percent difference between what is needed and what client is saving
        // anything less than 3% difference is "on track"
        const [RSN, FVT] = [Retirement_Savings_Needed.value, Future_Value_Of_Savings_Total.value]
        const pctDiff = 100 * (FVT - RSN) / ((FVT + RSN) / 2);
        reachedGoal = pctDiff >= -3;

        if (!reachedGoal) {
          const aboveOrBelow = (Current_Monthly_Savings.value < Monthly_Savings_Needed.value) ? "below" : "above";
          groupedAdvice["Our Advice"].unshift({
            headline_html: `<p class="lead">By saving
             ${this.tfvar(Current_Monthly_Savings)}
            per month you are <strong>${aboveOrBelow}</strong> the
            ${this.tfvar(Monthly_Savings_Needed)}
             required to retire comfortably by age 
             ${this.tfvar(Retirement_Age)}, in
             ${this.tfvar(Retirement_Year_Target)}.</p>`,
          })
        }
      }

      // put advice in specific array order (pre-optimized, optimized, else)
      data.advice = _.compact([].concat(groupedAdvice["Our Advice"]).concat(groupedAdvice["Reaching Your Goal"])).map(a => {
        a.isOptimized = true;
        return a;
      })
      data.advice.unshift(currentPreOptimizedAdvice);

      const assumptions = _.groupBy(answers, (a) => {
        return (a.tagGroup) ? a.tagGroup.name : "Assumptions";
      });

      data.save_to_goal = {
        advice: data.advice,
        assumptions: assumptions,
        canOptimize: false // optimized already
      }

      this.saveGoal(controllerName, data, goalId);
    });
  }

  _preload_goal(goal, params = {}) {
    const { data, controllerName } = goal;
    console.log(`Need to preload API for ${controllerName}`);

    return $.ajax({
      url: data._links.base,
      data: _.assign(data.params, params),
    }).then(api => {
      return api.data;
    });
  }

  get monthlyIncome() {
    const { Income_Monthly = 0 } = this.profile;
    return Number(Income_Monthly);
  }

  get monthlyExpenses() {
    const { Expenses_Monthly = 0 } = this.profile;
    return Number(Expenses_Monthly);
  }

  get startingCash() {
    const cash = Number(this.monthlyIncome) - Number(this.monthlyExpenses);
    const n = Number(cash.toFixed(2));
    this.pushToFormulaDebug({
      name: "startingCash",
      expression: `${Number(this.monthlyIncome)}-${Number(this.monthlyExpenses)}`,
      result: cash
    });
    return n;
  }

  get availableCash() {
    const cash = this.startingCash - this.costOfGoals;
    const n = Number(cash.toFixed(2));
    this.pushToFormulaDebug({
      name: "availableCash",
      expression: `${this.startingCash}-${this.costOfGoals}`,
      result: cash
    });
    return n;
  }

  get percentAllocated() {
    const p = this.costOfGoals / this.startingCash;
    this.pushToFormulaDebug({
      name: "percentAllocated",
      expression: `${this.costOfGoals}/${this.startingCash}*100`,
      result: p * 100
    });
    return p;
  }

  isDebtCreditCardDebt(payoffDebt) {
    return payoffDebt && payoffDebt?.data?.variables_map?.Debt_Type_FRB?.value.toLowerCase().includes("credit card");
  }

  getGoalByName(controllerName) {
    return this.savedGoals.find(g => { return g.controllerName == controllerName });
  }

  getCostFor(controllerName) {
    const goal = this.getGoalByName(controllerName);
    let cost = 0;
    if (!goal) { return cost; }

    const { data: { variables_map = {} } } = goal;
    const {
      Current_Monthly_Savings = { value: 0 },
      // "401K_Match_Monthly": _401K_Match_Monthly = { value: 0 },
      Debt_Payment_Total = { value: 0 },
      Mortgage_Down_Payment_Savings_Monthly = { value: 0 }
    } = variables_map;

    switch (controllerName) {
      case "pay-debt":
        if (!Debt_Payment_Total.value) { Debt_Payment_Total.value = 0; }
        cost += Number(Debt_Payment_Total.value.toFixed(2));
        break;
      case "save-for-home":
        if (!Mortgage_Down_Payment_Savings_Monthly.value) { Mortgage_Down_Payment_Savings_Monthly.value = 0; }
        cost += Number(Mortgage_Down_Payment_Savings_Monthly.value.toFixed(2));
        break;
      case "retirement":
        // cost += (Number(Current_Monthly_Savings.value.toFixed(2)) - Number(_401K_Match_Monthly.value.toFixed(2)));
        if (!Current_Monthly_Savings.value) { Current_Monthly_Savings.value = 0; }
        cost += Number(Current_Monthly_Savings.value.toFixed(2));
        break;
    }

    this.pushToFormulaDebug({
      name: "costForGoal: " + controllerName,
      expression: `${cost}`,
      result: cost
    });

    return cost;
  }

  get costOfGoals() {
    let cost = 0;
    cost += this.getCostFor("pay-debt");
    cost += this.getCostFor("save-for-home");
    cost += this.getCostFor("retirement");
    this.pushToFormulaDebug({
      name: "costOfGoals",
      expression: `${this.getCostFor("pay-debt")}+${this.getCostFor("save-for-home")}+${this.getCostFor("retirement")}`,
      result: cost
    });
    return cost;
  }

  renderBudgetAndGoals(){
    const showBudget = (this.profile && this.profile.budgetcreated);
    $("#budget_start").toggle(!showBudget);
    const $container = $("#user_selected_goals");
    if ($container.length) {
      const goals = this.prioritzeGoals();
      // remove 1st advice from
      const ctx = {
        goals,
        incomeF: numeral(this.monthlyIncome).format("$0,0"),
        expensesF: numeral(this.monthlyExpenses).format("$0,0"),
        positiveAvailableCash: this.availableCash >= 0,
        availableCashF: numeral(this.availableCash).format("$0,0"),
        startingCashF: numeral(this.startingCash).format("$0,0"),
        percentAllocatedF: numeral(this.percentAllocated).format("0%"),
        costOfGoalsF: numeral(this.costOfGoals).format("$0,0"),
        showOptimizeButton: goals.length > 1 && this.availableCash != 0
      }
      console.log("Rendering prioritzed goals", ctx);
      const str = Handlebars.compile($("#tmpl_user_selected_goals").html())(ctx);
      $container.html(str);

      // disable goal tiles if goal exists
      const saveForHome = this.getGoalByName("save-for-home");
      const payoffDebt = this.getGoalByName("pay-debt");
      const saveRetirement = this.getGoalByName("retirement");
      const $tiles = $(".goal-tiles a");
      $tiles.eq(0).prop("disabled", saveForHome !== undefined).toggleClass("disabled", saveForHome !== undefined);
      $tiles.eq(1).prop("disabled", saveRetirement !== undefined).toggleClass("disabled", saveRetirement !== undefined);
      $tiles.eq(2).prop("disabled", payoffDebt !== undefined).toggleClass("disabled", payoffDebt !== undefined);
    }

    this.renderStartPageAssumptions(showBudget);
    this.renderStartPageDebug(showBudget);
    this.updateTaffrailVarHtml();
  }

  renderStartPageAssumptions(showBudget) {
    if (!showBudget) {
      console.log("No budget, not rendering assumptions left column");
      return;
    }

    const assumptions = {};

    const debt = this.getGoalByName("pay-debt")?.data?.save_to_goal?.assumptions || {};
    const home = this.getGoalByName("save-for-home")?.data?.save_to_goal?.assumptions || {};
    const retire = this.getGoalByName("retirement")?.data?.save_to_goal?.assumptions || {};
    const profileAssump = this.getGoalByName("profile")?.data?.save_to_goal?.assumptions || {};

    Object.keys(debt).forEach(k => {
      if (!assumptions[k]) {
        assumptions[k] = debt[k];
      } else {
        assumptions[k] = _.unionBy(assumptions[k], debt[k], (a) => { return a.form.name; });
      }
    });
    Object.keys(home).forEach(k => {
      if (!assumptions[k]) {
        assumptions[k] = home[k];
      } else {
        assumptions[k] = _.unionBy(assumptions[k], home[k], (a) => { return a.form.name; });
      }
    });
    Object.keys(retire).forEach(k => {
      if (!assumptions[k]) {
        assumptions[k] = retire[k];
      } else {
        assumptions[k] = _.unionBy(assumptions[k], retire[k], (a) => { return a.form.name; });
      }
    });
    Object.keys(profileAssump).forEach(k => {
      if (!assumptions[k]) {
        assumptions[k] = profileAssump[k];
      } else {
        assumptions[k] = _.unionBy(assumptions[k], profileAssump[k], (a) => { return a.form.name; });
      }
    });

    this.allAssumptions = assumptions;

    // do we have ANY assumptions/answers yet?
    // show or hide depending
    // simple helper for UX
    const _answersExist = true;
    $(".assumptions-container > div").css("visibility", _answersExist ? "visible" : "hidden");
    $(".assumptions-outer-container").toggleClass("assumptions-outer-container--empty", !_answersExist);
    // only show expand button if there's grouped assumptions besides "ungrouped"
    $(".assumption-expander").toggle(_.without(Object.keys(assumptions), "ungrouped").length > 0);
    const strAssump = Handlebars.compile($("#tmpl_assumptionsList").html())({ _answersExist, assumptions });
    $(".assumptions").html(strAssump);
  }

  /**
 * Click handler for assumptions or Q&A
 */
  handleClickAssumption() {
    $(".assumptions-outer-container").on("click", ".a > a, a.statement", e => {
      e.preventDefault();
      return false;
    });
  }

  /**
 * Listener for opening/closing assumption groups
 */
  handleCollapseAssumptionGroup() {
    $(".assumptions-outer-container").on("click", ".a > a, a.statement", e => {
      e.preventDefault();
    });

    $(".assumptions").on("show.bs.collapse", "ol.assumptions-list.collapse", (e) => {
      const $this = $(e.currentTarget);
      // const { groupId } = $this.find("li").first().data();
      // store.set(`assumption_${groupId}_${this.api.adviceset.id}`, true);
      const $toggler = $(`a[aria-controls=${$this.prop("id")}]`);
      $toggler.find("i").addClass("fa-chevron-down").removeClass("fa-chevron-right");
    });

    $(".assumptions").on("hidden.bs.collapse", "ol.assumptions-list.collapse", (e) => {
      const $this = $(e.currentTarget);
      // const { groupId } = $this.find("li").first().data();
      // store.set(`assumption_${groupId}_${this.api.adviceset.id}`, false);
      const $toggler = $(`a[aria-controls=${$this.prop("id")}]`);
      $toggler.find("i").removeClass("fa-chevron-down").addClass("fa-chevron-right");
    });
  }

  renderStartPageDebug(showBudget) {
    const debug = _.sortBy(_.compact(_.flatMap(this.savedGoals.map(goal => {
      return goal.data.formulaDebug;
    }))), o => { return o.name; });
    const allVariables = _.compact(_.flatMap(this.savedGoals.map(goal => {
      return goal.data.variables;
    })));

    this.allVariables = allVariables;
    this.formulaDebug = this.formulaDebug.concat(debug);

    this.updateAdviceDebugSidebar();
  }

  pushToFormulaDebug(obj) {
    const { id, name, expression, expressionDebug, result, result_formatted } = obj;

    // if item exists, update it
    const index = _.findIndex(this.formulaDebug, (fd) => { return fd.name == name; });
    if (index > -1) {
      this.formulaDebug.splice(index, 1, obj)
    } else {
      this.formulaDebug.unshift({
        id,
        name,
        expression,
        expressionDebug,
        result,
        result_formatted,
      });
    }
  }

  /**
   * Helper to build taffrail-var HTML
   * @param {} variable
   * @param {*} content
   * @returns
   */
  tfvar(variable, content) {
    if (!content) { content = variable?.valueFormatted || variable.value; }
    return `<taffrail-var 
      data-variable-name="${variable.name}" 
      data-variable-id="${variable.id}" 
      tabindex=0
      data-format="${variable.format}"
      data-raw-value="${variable.value}">
        ${content}</taffrail-var>`
  }

  /**
 * Update inline HTML for taffrail variables
 */
  updateTaffrailVarHtml() {
    // handle taffrail-var
    $("body").find("taffrail-var").each((i, el) => {
      const $el = $(el);
      const { variableId, variableName } = $el.data();
      // find corresponding question
      const question = _.flatMap(this.allAssumptions).find((a) => {
        // check question rules first, then input requests
        return a.form.questionVariable?.reservedName == variableName || a.form.name == variableName;
      });
      if (question) {
        $el
          .addClass("active active--not-linked")
        ;
      } else {
        // if not a question, check for raw formula
        if (this?.formulaDebug) {
          const source = this.formulaDebug.find(f => { return f.id == variableId });
          if (!source) { /* console.error("no source found", variableId);*/ return; }
          const isInSidebar = $el.closest(".advice-debug").length;
          if (isInSidebar) { return; }

          const varLookup = this.allVariables.find(v => { return v.id == variableId });
          if (!varLookup) { console.error("no var found", variableId); return; }

          const html = `
            <div class="debug-card">
              <div>
                <h5>Variable</h5>
                <div class="d-flex justify-content-between">
                  <div class="text-monospace var-name">
                    <a href="#">${varLookup.name}</a>
                  </div>
                  <a href="#formula_${variableId}" class="jumptoformula"><i class="fal fa-sort-amount-down-alt"></i></a>
                </div>
                <div class="expression">
                  <h5>Formula</h5>
                  <div class="d-flex justify-content-between">
                    <code class="exp cpy">${source.expression}</code>
                    <code class="value text-right">= ${source.result}</code>
                  </div>
                </div>

                <div class="exp-debug">
                  <h5>Expression debug</h5>
                  <code class="cpy">${source.expressionDebug}</code>
                </div>
              </div>
            </div>
          `;

          $el
            .addClass("active active--calculated")
            .attr("tabindex", 0)
            .attr("role", "button")
            .popover({
              container: "body",
              placement: "top",
              title: "Inspector",
              content: html,
              html: true,
              trigger: "focus"
            })
            .on("shown.bs.popover", e => {
              $(".popover")
                .find(".cpy")
                .on("click", e => {
                  e.preventDefault();
                  const $el = $(e.currentTarget);
                  copy($el.text()).then(() => {
                    $el.tooltip("dispose");
                  });
                })
                .tooltip({ title: "Click to copy" })
              ;
              $(".popover")
                .find("a.jumptoformula")
                .on("click", e => {
                  e.preventDefault();
                  const $el = $(e.currentTarget);
                  $el.tooltip("dispose");
                  const link = $el.attr("href");
                  $("html, body").animate({ scrollTop: $(`${link}`).offset().top - 50 }, 400, () => {
                    $(`${link}`).addClass("flash");
                  });
                })
                .tooltip({ title: "Jump to formula" })
              ;
            })
          ;
        }
      }
    });
  }

  /**
 * Update advice debug sidebar
 */
  updateAdviceDebugSidebar() {
    // render
    this.formulaDebug = _.compact((this.formulaDebug || []).map(f => {
      const varLookup = this.allVariables.find(v => { return f.id == v.id });
      if (f.name.toLowerCase().endsWith("_txt")) {
        return null;
      }
      if (f.expression == "1" || f.expression == "0" || f.name.startsWith("IRS")) {
        // console.log(f)
        f._hide_result = true;
        f.expression = "";
        // f.result_formatted = f.expressionDebug;
      }
      if (varLookup) {
        f.result_formatted = f.result;
        if (varLookup.format) {
          f.result_formatted = numeral(f.result).format(varLookup.format);
        }
      }
      return f;
    }));

    const str = Handlebars.compile($("#tmpl_adviceDebugSidebar").html())({ formulaDebug: this.formulaDebug });
    $(".advice-debug").html(str);
  }

  resetGoals() {
    // this.savedGoals = [];
    const profile = this.getGoalByName("profile");
    this.savedGoals = [profile];
  }

  deleteGoal(id) {
    const newGoals = this.savedGoals.filter(g => { return g.id != id });
    this.savedGoals = newGoals;
  }

  saveGoal(controllerName, api = window.jga.api, goalId) {
    const nameMap = {
      "save-for-home": "Save for a home",
      "retirement": "Save for retirement",
      "pay-debt": "Payoff debt",
      "profile": "Profile"
    }
    const data = _.pick(api, "adviceset", "params", "paramsAsQueryStr", "variables_map", "variables", "save_to_goal", "_links", "formulaDebug");
    const { save_to_goal } = data;
    const { advice } = save_to_goal;
    const [headline] = advice;
    let [,headline_optimized = {}] = advice;
    if (!headline_optimized.isOptimized) {
      headline_optimized = null;
    }
    // console.log(advice)
    // console.log(data);

    // remove headline item from data.display[] so we don't dupe
    const filteredAdvice = advice.filter(a => { return a.id != headline.id });

    data.display = filteredAdvice;

    // api url
    const apiUrl = new URL(data._links.self);
    data._links.base = `${apiUrl.origin}${apiUrl.pathname}`

    const newGoal = [{
      name: nameMap[controllerName],
      controllerName,
      data,
      headline,
      headline_optimized,
      id: goalId || _.uniqueId(`${controllerName}_`)
    }];

    // delete current goal, if saved, and replace with new/updated
    const goalToDelete = this.getGoalByName(controllerName);
    if (goalToDelete){
      this.deleteGoal(goalToDelete.id);
    }

    // set new goals
    this.savedGoals = this.savedGoals.concat(newGoal);

    // if it's NOT an update, show the PN
    if (!goalId) {
      this.emit("goals", { message: "Goal saved! Action Plan updated." });
    }
  }

  emit(name, detail) {
    $(document).trigger("pushnotification", [name, detail]);
  }

  /**
   * Map variables into named list
   */
  mapVariables(api) {
    const vars = api.variables || [];
    api.variables_map = {}
    vars.forEach(v => {
      // sometimes API doesn't return value property
      if (!_.has(v, "value")) {
        v.value = null;
      }
      api.variables_map[v.name] = v;
    });
    return api;
  }
}
