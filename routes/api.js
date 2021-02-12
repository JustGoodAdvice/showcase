const express = require("express");
const router = express.Router();
const { BitlyClient } = require("bitly");
const bitly = new BitlyClient(process.env.BITLY_TOKEN, {
  domain: "advice.link"
});
const ogs = require("open-graph-scraper");

/**
 * Shorten a long URL
 */
router.post("/shorten_only", (req, res, next) => {
  bitly
    .shorten(req.body.long_url)
    .then((result) => {
      return res.json(result);
    })
    .catch((error) => {
      return res.status(500).json(error);
    });
});

/**
 * Shorten AND add title+tags to a URL
 */
router.post("/shorten", (req, res, next) => {
  bitly
    .bitlyRequest("bitlinks", {
      long_url: req.body.long_url,
      title: req.body.title,
      tags: ["showcase"],
    })
    .then((result) => {
      return res.json(result);
    })
    .catch((error) => {
      return res.status(500).json(error);
    });
});

/**
   * This is a utility API to scrape OpenGraph meta data from URLs
   */
router.post("/ogs", (req, res, next) => {
  const { url } = req.body;
  if (!url) {
    return next(new Error("url is required"));
  }

  ogs({ "url": url, "allMedia": true }, (err, results) => {
    // `err` returns true or false, the error it self is in `results`

    // we don't actually want to expose the error here
    // as it'll trigger alarms in the logging system
    // the error must be caught on the client
    return res.json(results);
  });
});

module.exports = router;
