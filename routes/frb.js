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
    // Marital_Status: "single",
    // Age_Now: 25,
    // Salary: 150000,
    // // Annual_Expenses: 100000,
    // Expenses_Monthly: 100000 / 12,
    // Income_Monthly: 14000,
    budgetcreated: false
  },
  "Billy & Barbara": {
    _name: "Billy & Barbara",
    State: "CA",
    // Marital_Status: "Married",
    // Age_Now: 32,
    // Salary: 200000,
    // // Annual_Expenses: 130000,
    // Expenses_Monthly: 130000 / 12,
    // Income_Monthly: 20000,
    budgetcreated: false
  },
  "Client w/o settings": {
    _name: "Client w/o settings",
  }
}

router.get("/goal-planning/:start?", botMiddleware, (req, res, next) => {
  const { start: isStart } = req.params;
  const { budgetcreated = 0 } = req.query;
  return res.render("demo-frb/" + (isStart ? "/screens/start" : "index"), {
    layout: req.xhr ? false : "demo-frb/layout",
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
  return res.render(`demo-frb/screens/goals/${goal}`, {
    layout: req.xhr ? false : "demo-frb/layout",
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
    greenScreen: true,
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
