const botMiddleware = require("../middleware/bot");
const express = require("express");
const qs = require("querystring");
// const fetch = require("node-fetch");
const router = express.Router();
const greetingTime = require("greeting-time");

const PERSONAS = {
  "Doug": {
    _name: "Doug",
    State: "CA",
    Marital_Status: "Single",
    Age_Now: 25,
    MAGI: 150000,
    Compensation_Annual: 150000,
    Salary: 150000,
    Annual_Expenses: 100000,
    Residence: "Rent",
    // Debt_Balance: 25000,
    Investment_Amount_Balance: 25000,
    Cash_Balance: 5000,
    Account_Balance: 30000,
    Retirement_Account_Balance: 50000,
    "Fit_Living_Paycheck_to_Paycheck?": false,
    "Fit_Financially_Independent?": true,
  },
  "Billy & Barbara": {
    _name: "Billy & Barbara",
    State: "NJ",
    Marital_Status: "Married",
    Age_Now: 32,
    MAGI: 200000,
    Compensation_Annual: 200000,
    Salary: 200000,
    Annual_Expenses: 130000,
    Residence: "Own",
    // Debt_Balance: 10000,
    Investment_Amount_Balance: 100000,
    Cash_Balance: 25000,
    Account_Balance: 225000,
    Retirement_Account_Balance: 100000,
    "Fit_Living_Paycheck_to_Paycheck?": false,
    "Fit_Financially_Independent?": true,
  },
}

router.get("/goal-planning/:start?", botMiddleware, (req, res, next) => {
  const { start: isStart } = req.params;
  return res.render("demo-frb/" + (isStart ? "/screens/start" : "index"), {
    layout: req.xhr ? false : "demo-frb/layout",
    adviceSetId: "",
    linkApi: null,
    linkAdviceBuilder: null,
    PERSONAS: PERSONAS,
    inApp: isStart,
    showStart: isStart,
    greenScreen: !isStart,
    greeting: greetingTime(new Date())
  });
});

// TURBO
router.get("/goal-planning/goals/:goal", (req, res, next) => {
  const { goal } = req.params;
  return res.render(`demo-frb/screens/goals/${goal}`, {
    layout: req.xhr ? false : "demo-frb/layout",
    adviceSetId: "",
    linkApi: null,
    linkAdviceBuilder: null,
    PERSONAS: PERSONAS,
    inApp: true,
  });
});

router.get("/goal-planning/goals/taffrail/:adviceSetId", botMiddleware, (req, res, next) => {
  const { adviceSetId = "" } = req.params;

  const qrystr = Object.assign({}, req.query, {
    include: ["filteredVars"], showcase: true
  });
  const apiUrl = `${process.env.API_HOST}/api/advice/${adviceSetId}?${qs.stringify(qrystr)}`;

  const adviceSetView = {
    "JU-24nfNyguvAjZQiBbqLuf": "house-affordability", // Save For Home
    // "JUrkVc7CCdG": "house-affordability",
    // "JUZsZh4CUVp3MK8xpBYDhtI": "house-affordability",
    // "JU8dmuM8pIFQC9UT50bxZPc": "house-affordability", // How Much Home Can You Afford?
    // "FRz1m9tf9TlExqy6BBI2gfM": "house-affordability", // How Much Home Can You Afford?
    "JU5DZn-v5x1Pc8dasRn1UXk": "pay-debt",
    "JUpiGfEDTHNwejiELgpJlQp": "save-retirement",
    "JUhNUe4x5dNezRP1q5cNY4g": "save-retirement",
    "JUYUuNiqaBZJyNQOOmChLuy": "save-retirement",
    "JUWlttg90FD9fNGl-MxjoEM": "fitness",
  }

  let view = "error";
  if (adviceSetView[adviceSetId]){
    view = "demo-frb/screens/taffrail/" + adviceSetView[adviceSetId];
  }

  return res.render(view, {
    layout: req.xhr ? false : "demo-frb/layout",
    adviceSetId: adviceSetId,
    linkApi: apiUrl,
    linkAdviceBuilder: `${process.env.ADVICEBUILDER_HOST}/advicesets/${adviceSetId.substring(2)}/show`,
    PERSONAS: PERSONAS,
    message: view == "error" ? "Advice Set mapping invalid" : null,
    error: view == "error" ? {} : "",
    inApp: true,
    showDrawer: true,
  });

  // fetch(apiUrl, {
  //   headers: {
  //     "Accept": "application/json; charset=utf-8",
  //     "Authorization": `Bearer ${process.env.API_KEY}`
  //   }
  // }).then(res => {return res.json()})
  //   .then(api => {
  //     if (api.error) { return next(new Error(api.error.message)); }

  //     return res.render("demo-frb/screens/taffrail/house-affordability", {
  //       layout: req.xhr ? false : "demo-frb/layout",
  //       adviceSetId: adviceSetId,
  //       linkApi: apiUrl,
  //       linkAdviceBuilder: `${process.env.ADVICEBUILDER_HOST}/advicesets/${adviceSetId.substring(2)}/show`,
  //       api: api
  //     });
  //   })
  //   .catch(err => {
  //     return next(err);
  //   });
});

module.exports = router;
