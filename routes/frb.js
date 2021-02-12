const botMiddleware = require("../middleware/bot");
const express = require("express");
const router = express.Router();
const qs = require("querystring");

router.get("/:adviceSetId", botMiddleware, (req, res, next) => {
  const { adviceSetId } = req.params;
  if (!adviceSetId) { return next(); }

  const qrystr = Object.assign({}, req.query, {
    include: ["filteredVars"], showcase: true
  });
  const apiUrl = `${process.env.API_HOST}/api/advice/${adviceSetId}?${qs.stringify(qrystr)}`;

  return res.render("demo-frb", {
    adviceSetId: adviceSetId,
    linkApi: apiUrl,
    linkAdviceBuilder: `${process.env.ADVICEBUILDER_HOST}/advicesets/${adviceSetId.substring(2)}/show`,
    isMobile: true
  });
});

module.exports = router;
