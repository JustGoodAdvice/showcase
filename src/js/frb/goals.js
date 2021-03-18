import _ from "lodash";
import pluralize from "pluralize";
import store from "store";
import Handlebars from "handlebars";
import numeral from "numeral";
import qs from "querystring";
export default class {
  constructor(profile, isFirstLoad = false) {
    if (!profile) {
      $("#budget_start").toggle(true);
      return;
    }
    this.profile = profile;
    console.log("goals setup for", profile)

    this.STORAGE_KEY = "frb_user_goals_" + this.profile._name;

    if (isFirstLoad) {
      this.handleClickSaveGoal();
      this.handleClickDeleteGoal();
      this.handleClickResetGoals();
      this.handleClickOptimizeGoals();
      this.activateCurrentGoals();
      this.renderBudgetAndGoals();
    } else {
      this.activateCurrentGoals();
      this.renderBudgetAndGoals();
    }
  }

  get savedGoals() {
    const g = store.get(this.STORAGE_KEY, []);
    return g;
  }

  set savedGoals(arr) {
    store.set(this.STORAGE_KEY, arr);
    console.log("SAVING GOAL>>>>", arr);
    this.activateCurrentGoals();
  }

  get goalCount() {
    return this.savedGoals.length;
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

  _OPTIMIZE() {
    const queue = [];
    const isOverBudget = !(this.availableCash > 0);
    // const goals = this.savedGoals;
    // const goalCount = goals.length;
    const saveForHome = this.getGoalByName("save-for-home");
    const payoffDebt = this.getGoalByName("pay-debt");
    const debtIsCreditCardDebt = this.isDebtCreditCardDebt(payoffDebt);

    if (isOverBudget) {
      // if you have a home goal, reduce this first
      if (saveForHome) {
        const cost = this.getCostFor("save-for-home");
        console.log("cost", cost)
        console.log("availableCash", this.availableCash)
        const newMonthlyCost = cost + this.availableCash;
        console.log(newMonthlyCost)
      }
    } else {
      // under budget

      // if client has credit debt & home with extra cash, split between two to reach home goal
      if (payoffDebt && debtIsCreditCardDebt && saveForHome) {
        const {
          Debt_Payment_Suggested: { value: amNeededToPayOffDebtInHalfTime = 0 },
          Debt_Payoff_Period = { value: 0 }
        } = payoffDebt.data.variables_map;

        const {
          Goal_HomeSave_Adjust_Savings: { value: amtNeededToReachHomeGoal = 0 }
        } = saveForHome.data.variables_map;

        if (Debt_Payoff_Period.value <= 24) {
          console.error(`OPTIMIZE - apply ${this.availableCash} to pay off debt faster`);

          queue.push(this._OPTIMIZE_REFRESH_GOAL(payoffDebt, {
            Debt_Payment: this.availableCash + Number(payoffDebt.data.variables_map.Debt_Payment.value)
          }));

          // make home goal longer
          console.error("OPTIMIZE - stretch home goal longer");
          queue.push(this._OPTIMIZE_REFRESH_GOAL(saveForHome));

        } else {

        }
      }

      if (debtIsCreditCardDebt) {
        // total debt greater than available cash?
        // if (payoffDebt.data.variables_map.Debt_Balance.value > this.availableCash) {
        //   console.info(`OPTIMIZE - apply ${this.availableCash} to pay off debt faster`);

        //   payoffDebt.data.params = _.assign(payoffDebt.data.params, {
        //     Debt_Payment: this.availableCash + Number(payoffDebt.data.variables_map.Debt_Payment.value)
        //   })
        //   this._OPTIMIZE_REFRESH_GOAL(payoffDebt, payoffDebt.data);
        // }
      }
    }

    Promise.all(queue).then(() => {
      this.renderBudgetAndGoals();
      this.emit("opto", { message: "Your Action Plan is optimized." });
    }).catch(err => {
      console.error(err);
      this.emit("opto", { message: err.message });
    });
  }

  _OPTIMIZE_REFRESH_GOAL(goal, params = {}){
    const { id: goalId, controllerName, data } = goal;
    console.log(goalId, data)
    const $container = $(`#heading_${goalId}`); // card-header
    const $summary = $container.find(".card-header-summary");
    $summary.html("Optimizing...");

    return $.ajax({
      url: data._links.base,
      data: _.assign(data.params, params),
    }).then(api => {
      const { data } = api;
      this.mapVariables(data);
      data.paramsAsQueryStr = qs.stringify(data.params);

      console.log("OPTIMIZED API response", data)

      if (controllerName == "pay-debt") {
        // const newSummary = _.first(data.advice.filter(a => { return a.type == "ADVICE"; }));
        // $summary.html(newSummary.headline_html);


      }

      data.save_to_goal = {
        advice: data.advice.filter(a => { return a.type == "ADVICE"; })
      }

      this.saveGoal(controllerName, data, goalId);
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
    return Number(cash.toFixed(2));
  }

  get availableCash() {
    const cash = this.startingCash - this.costOfGoals;
    return Number(cash.toFixed(2));
  }

  get percentAllocated() {
    const p = this.costOfGoals / this.startingCash;
    return p;
  }

  isDebtCreditCardDebt(payoffDebt) {
    return payoffDebt && payoffDebt?.data?.variables_map?.Debt_Type_FRB?.value == "credit card";
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
      Debt_Payment = { value: 0 },
      Mortgage_Down_Payment_Savings_Monthly = { value: 0 }
    } = variables_map;

    switch (controllerName) {
      case "pay-debt":
        cost += Debt_Payment.value;
        break;
      case "save-for-home":
        cost += Mortgage_Down_Payment_Savings_Monthly.value;
        break;
      case "retirement":
        cost += Current_Monthly_Savings.value;
        break;
    }

    return cost;
  }

  get costOfGoals() {
    let cost = 0;
    cost += this.getCostFor("pay-debt");
    cost += this.getCostFor("save-for-home");
    cost += this.getCostFor("retirement");

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
        showOptimizeButton: this.availableCash > 0 && goals.length > 1
      }
      console.log("goals ctx", ctx)
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
  }

  resetGoals() {
    this.savedGoals = [];
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
    }
    const data = _.pick(api, "adviceset", "params", "paramsAsQueryStr", "variables_map", "save_to_goal", "_links");
    const { save_to_goal } = data;
    const { advice } = save_to_goal;
    const [headline] = advice;

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
      id: goalId || _.uniqueId(`${controllerName}_`)
    }];

    // delete current goal, if saved, and replace with new/updated
    const goalToDelete = this.getGoalByName(controllerName);
    if (goalToDelete){
      this.deleteGoal(goalToDelete.id);
    }

    // set new goals
    this.savedGoals = this.savedGoals.concat(newGoal);

    this.emit("goals", { message: "Goal saved! Action Plan updated." });
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
