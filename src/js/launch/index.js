import _ from "lodash";
import Handlebars from "handlebars";
import ShowcasePage from "../showcasePage";

export default class extends ShowcasePage {
  init() {
    super.init();
    this.initCache();
    this.updateAdviceSetDetails().then(() => {
      // current querystring without "?" prefix
      const querystring = location.search.substr(1);
      return this._loadApi(querystring, $(".row .advice")).then(api => {
        console.log(api)
      });
    });
  }

  /**
   * Slight speed update to cache frequently-used templates and selectors
   */
  initCache() {
    // cache element selectors
    this.$advice = $(".advice");
    // cache templates
    this.TEMPLATES = {
      "AdviceSetDetails": Handlebars.compile($("#tmpl_adviceSetDetails").html()),
      // "InputRequest": Handlebars.compile($("#tmpl_adviceInputRequest").html()),
      // "Advice": Handlebars.compile($("#tmpl_adviceAdvice").html()),
      // "Recommendations": Handlebars.compile($("#tmpl_groupedRecommendationsAdviceList").html()),
      // "RecommendationsOnThisPage": Handlebars.compile($("#tmpl_groupedRecommendationsAdviceListTOC").html()),
      // "Assumptions": Handlebars.compile($("#tmpl_assumptionsList").html()),
      // "QuestionsAnswers": Handlebars.compile($("#tmpl_answersList").html()),
      // "Error": Handlebars.compile($("#tmpl_error").html()),
    };
  }

  /**
   * Update Advice Set details (banner + detail)
   */
  updateAdviceSetDetails() {

    // internal helper to render banner & update <title>
    const _render = (data) => {
      const str = this.TEMPLATES["AdviceSetDetails"](data);
      $(".advice-set-details").html(str);
      // update the window title
      this.windowTitle = `${data.adviceset.title} - ${data.adviceset.owner.name}`;
    }

    const data = { adviceset: {} }

    return $.ajax({
      url: this.api.adviceset._links.self,
      type: "GET",
      dataType: "json",
      headers: {
        "Accept": "application/json; chartset=utf-8",
        "Authorization": `Bearer ${this.config.api_key}`
      }
    }).then(api => {
      const { data: { aiUserRequests = [], adviceScenarios, entity, publishing, owner, tags } } = api;

      this.config.adviceset = api.data;

      data.adviceset = {
        title: entity.name,
        description: entity.description,
        owner: owner,
        _links: this.api.adviceset._links
      }

      // add new adviceset data to the state
      this.api.adviceset = _.extend(this.api.adviceset, {
        adviceScenarios,
        aiUserRequests,
        publishing,
        tags
      });

      // check for referring AI UserRequest ID on querystring
      // and find matching question for banner
      if (this.fromAiUrId) {
        const matchingAiUr = aiUserRequests.find(aiur => { return aiur.id == this.fromAiUrId });
        if (matchingAiUr) {
          const { request, description } = matchingAiUr;
          data.adviceset.title = request;
          data.adviceset.description = description ? description : entity.description;
        }
      }

      _render(data);
    }).catch(jqXHR => {
      let err = "Error";
      if (jqXHR.responseJSON) {
        err = jqXHR.responseJSON.error.message;
      } else {
        err = jqXHR.statusText || jqXHR.message;
      }
      // insert error on banner
      _render({
        adviceset: {
          title: err,
          description: "API unavailable"
        }
      });
    });
  }
}
