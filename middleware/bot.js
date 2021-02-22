const isbot = require("isbot");
const qs = require("querystring");
const request = require("request");

// serve OG meta tags to bots since this app is sorta like a SPA
module.exports = (req, res, next) => {
  const { adviceSetId } = req.params;
  const { nobot } = req.query;
  if (nobot == 1 || !adviceSetId) {
    return next();
  }

  if (isbot(req.get("user-agent"))) {
    // get data from Advice API for meta tags
    // and prerendering basic HTML structure
    const qrystr = Object.assign({}, req.query, {
      include: ["filteredVars"], showcase: true
    });
    const apiUrl = `${process.env.API_HOST}/api/advice/${adviceSetId}?${qs.stringify(qrystr)}`;
    request.get(apiUrl, {
      headers: {
        "Accept": "application/json; charset=utf-8",
        "Authorization": `Bearer ${process.env.API_KEY}`
      }
    }, (err, resp, body) => {
      if (err) { return next(err); }

      if (resp.statusCode > 200) {
        console.warn(resp);
        return next(new Error(resp.statusMessage));
      }

      if (!err && resp.statusCode == 200) {
        const api = JSON.parse(body);
        if (api.error) { return next(new Error(api.error.message)); }

        return res.render("showcase/bot", {
          api: api,
          layout: false
        });
      } else {
        console.error("unexpected!");
        return res.status(resp.statusCode).send(body);
      }
    });
  } else {
    return next();
  }
}
