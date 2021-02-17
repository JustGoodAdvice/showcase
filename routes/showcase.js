const botMiddleware = require("../middleware/bot");
const express = require("express");
const router = express.Router();
const qs = require("querystring");

router.get("/:adviceSetId/:view?", botMiddleware, (req, res, next) => {
  const { adviceSetId, view = "index" } = req.params;
  if (!adviceSetId) { return next(); }

  const allowedViews = ["index", "mobile", "virtual-assistant", "salesforce", "__cleanshot"];
  const template = (allowedViews.includes(view)) ? view : allowedViews[0];
  const isMobile = view == "mobile" || view == "virtual-assistant";
  const qrystr = Object.assign({}, req.query, {
    include: ["filteredVars"], showcase: true
  });
  const apiUrl = `${process.env.API_HOST}/api/advice/${adviceSetId}?${qs.stringify(qrystr)}`;

  return res.render(`showcase/${template}`, {
    layout: false,
    adviceSetId: adviceSetId,
    linkApi: apiUrl,
    linkAdviceBuilder: `${process.env.ADVICEBUILDER_HOST}/advicesets/${adviceSetId.substring(2)}/show`,
    isMobile: isMobile
  });
});

module.exports = router;
