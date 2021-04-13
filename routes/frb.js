const botMiddleware = require("../middleware/bot");
const express = require("express");
const qs = require("querystring");
const router = express.Router();
const greetingTime = require("greeting-time");

const PERSONAS = {
  "Doug": {
    _name: "Doug",
    State: "CA",
    Marital_Status: "single",
    Age_Now: 25,
    Salary: 150000,
    Expenses_Monthly: 7000,
    Income_Monthly: 10000,
    budgetcreated: true,

    // home
    Mortgage_Down_Payment_Savings_Current: 30000,
    Mortgage_Down_Payment_Savings_Monthly: 1000,
    Home_Price: 750000,
    Home_Purchase_Time_Frame: 4,

    // debt
    Debt_Type_FRB: "credit card",
    Debt_Balance: 15000,
    Debt_Payment_Is_Minimum: false,
    Debt_Payment_Additional: 112,
    Debt_Interest_APR: .19,

    // retirement
    Current_Retirement_Savings: 50000,
    "401K?": true,
    "401K_Company_Match?": true,
    "401K_Tier1_Match_Pct": 1,
    "401K_Tier1_Up_To_Pct": 0.03,
    "401K_Contribution_Current_Pct": .08,
    "IRA?": false,
    "401K_Tiers": 1,
    Monthly_Retirement_Savings_Other_Current: 0,
  },
  "Billy & Barbara": {
    _name: "Billy & Barbara",
    State: "CA",
    Marital_Status: "married",
    Age_Now: 32,
    Age_Spouse: 32,
    Salary: 200000,
    Expenses_Monthly: 10000,
    Income_Monthly: 19000,
    budgetcreated: true,

    // home
    Mortgage_Down_Payment_Savings_Current: 100000,
    Mortgage_Down_Payment_Savings_Monthly: 2000,
    Home_Price: 1000000,
    Home_Purchase_Time_Frame: 5,

    // debt
    Debt_Type_FRB: "student loan",
    Debt_Balance: 150000,
    Debt_Payment: 2125,
    Debt_Payment_Is_Minimum: true,

    // retirement
    Current_Retirement_Savings: 150000,
    "401K?": true,
    "401K_Company_Match?": true,
    "401K_Tier1_Match_Pct": 0.5,
    "401K_Tier1_Up_To_Pct": 0.06,
    "401K_Tiers": 1,
    "401K_Contribution_Current_Pct": .13,
    "IRA?": true,
    Monthly_IRA_Contribution_Current: 500,
    Monthly_Retirement_Savings_Other_Current: 0,
  },
  "Client w/o settings": {
    _name: "Client w/o settings",
  }
}

router.get("/v2/goal-planning/start", botMiddleware, (req, res, next) => {
  const isStart = true;
  const { budgetcreated = 0 } = req.query;
  return res.render("demo/frb/v2/start", {
    layout: req.xhr ? false : "demo/frb/v2/layout",
    adviceSetId: "",
    linkApi: null,
    linkAdviceBuilder: null,
    PERSONAS: PERSONAS,
    inApp: isStart,
    showStart: isStart,
    budgetcreated: budgetcreated,
    greenScreen: true,
    greeting: greetingTime(new Date())
  });
});

// TURBO
router.get("/v2/goal-planning/goals/:goal", (req, res, next) => {
  const { goal } = req.params;

  const baseUrl = "/frb/v2/goal-planning/goals/taffrail";
  if (goal == "saveforhome") {
    res.redirect(`${baseUrl}/JU-24nfNyguvAjZQiBbqLuf`);
  } else if (goal == "saveforretirement") {
    res.redirect(`${baseUrl}/JUGzB62H3ERLF4P_TJ9ObJs`);
  } else if (goal == "paydowndebt") {
    res.redirect(`${baseUrl}/JU5DZn-v5x1Pc8dasRn1UXk`);
  } else {

    return res.render(`demo/frb/v2/screens/goals/${goal}`, {
      layout: req.xhr ? false : "demo/frb/v2/layout",
      adviceSetId: "",
      linkApi: null,
      linkAdviceBuilder: null,
      PERSONAS: PERSONAS,
      inApp: true,
      greenScreen: true,
    });
  }
});

router.get("/v2/goal-planning/goals/taffrail/:adviceSetId", botMiddleware, (req, res, next) => {
  const { adviceSetId = "" } = req.params;

  const qrystr = Object.assign({}, req.query, {
    include: ["filteredVars"], showcase: true
  });
  const apiUrl = `${process.env.API_HOST}/api/advice/${adviceSetId}?${qs.stringify(qrystr)}`;

  const adviceSetView = {
    "JUsIoPDhkNcvs1zb8UErR1I": "profile", // User profile
    "JU-24nfNyguvAjZQiBbqLuf": "house-affordability", // Save For Home
    // "JUrkVc7CCdG": "house-affordability",
    // "JUZsZh4CUVp3MK8xpBYDhtI": "house-affordability",
    // "JU8dmuM8pIFQC9UT50bxZPc": "house-affordability", // How Much Home Can You Afford?
    // "FRz1m9tf9TlExqy6BBI2gfM": "house-affordability", // How Much Home Can You Afford?
    "JU5DZn-v5x1Pc8dasRn1UXk": "pay-debt",
    "JU5lUXFbzWeilgzpmxrS9jT": "pay-debt",
    "JUpiGfEDTHNwejiELgpJlQp": "save-retirement",
    "JUhNUe4x5dNezRP1q5cNY4g": "save-retirement",
    "JUYUuNiqaBZJyNQOOmChLuy": "save-retirement",
    "JUGzB62H3ERLF4P_TJ9ObJs": "save-retirement",
    "JUWlttg90FD9fNGl-MxjoEM": "fitness",
  }

  let view = "error";
  if (adviceSetView[adviceSetId]) {
    view = "demo/frb/v2/screens/taffrail/" + adviceSetView[adviceSetId];
  }

  // tell turbolinks to update the page URL after server-side redirect
  res.header("Turbolinks-Location", "/frb" + req.path);

  return res.render(view, {
    layout: req.xhr ? false : "demo/frb/v2/layout",
    adviceSetId: adviceSetId,
    linkApi: apiUrl,
    linkAdviceBuilder: `${process.env.ADVICEBUILDER_HOST}/advicesets/${adviceSetId.substring(2)}/show`,
    PERSONAS: PERSONAS,
    message: view == "error" ? "Advice Set mapping invalid" : null,
    error: view == "error" ? {} : "",
    inApp: true,
    showDrawer: true,
    greenScreen: true,
  });
});

// MOBILE APP PROTOTYPE

router.get("/goal-planning/:start?", botMiddleware, (req, res, next) => {
  const { start: isStart } = req.params;
  const { budgetcreated = 0 } = req.query;
  return res.render("demo/frb/" + (isStart ? "/screens/start" : "index"), {
    layout: req.xhr ? false : "demo/frb/layout",
    adviceSetId: "",
    linkApi: null,
    linkAdviceBuilder: null,
    PERSONAS: PERSONAS,
    inApp: isStart,
    showStart: isStart,
    budgetcreated: budgetcreated,
    greenScreen: true,
    greeting: greetingTime(new Date())
  });
});

// TURBO
router.get("/goal-planning/goals/:goal", (req, res, next) => {
  const { goal } = req.params;
  return res.render(`demo/frb/screens/goals/${goal}`, {
    layout: req.xhr ? false : "demo/frb/layout",
    adviceSetId: "",
    linkApi: null,
    linkAdviceBuilder: null,
    PERSONAS: PERSONAS,
    inApp: true,
    greenScreen: true,
  });
});

router.get("/goal-planning/goals/taffrail/:adviceSetId", botMiddleware, (req, res, next) => {
  const { adviceSetId = "" } = req.params;

  const qrystr = Object.assign({}, req.query, {
    include: ["filteredVars"], showcase: true
  });
  const apiUrl = `${process.env.API_HOST}/api/advice/${adviceSetId}?${qs.stringify(qrystr)}`;

  const adviceSetView = {
    "JUsIoPDhkNcvs1zb8UErR1I": "profile", // User profile
    "JU-24nfNyguvAjZQiBbqLuf": "house-affordability", // Save For Home
    // "JUrkVc7CCdG": "house-affordability",
    // "JUZsZh4CUVp3MK8xpBYDhtI": "house-affordability",
    // "JU8dmuM8pIFQC9UT50bxZPc": "house-affordability", // How Much Home Can You Afford?
    // "FRz1m9tf9TlExqy6BBI2gfM": "house-affordability", // How Much Home Can You Afford?
    "JU5DZn-v5x1Pc8dasRn1UXk": "pay-debt",
    "JU5lUXFbzWeilgzpmxrS9jT": "pay-debt",
    "JUpiGfEDTHNwejiELgpJlQp": "save-retirement",
    "JUhNUe4x5dNezRP1q5cNY4g": "save-retirement",
    "JUYUuNiqaBZJyNQOOmChLuy": "save-retirement",
    "JUGzB62H3ERLF4P_TJ9ObJs": "save-retirement",
    "JUWlttg90FD9fNGl-MxjoEM": "fitness",
  }

  let view = "error";
  if (adviceSetView[adviceSetId]){
    view = "demo/frb/screens/taffrail/" + adviceSetView[adviceSetId];
  }

  return res.render(view, {
    layout: req.xhr ? false : "demo/frb/layout",
    adviceSetId: adviceSetId,
    linkApi: apiUrl,
    linkAdviceBuilder: `${process.env.ADVICEBUILDER_HOST}/advicesets/${adviceSetId.substring(2)}/show`,
    PERSONAS: PERSONAS,
    message: view == "error" ? "Advice Set mapping invalid" : null,
    error: view == "error" ? {} : "",
    inApp: true,
    showDrawer: true,
    greenScreen: true,
  });
});

module.exports = router;
