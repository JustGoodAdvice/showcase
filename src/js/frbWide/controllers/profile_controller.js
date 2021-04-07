import _ from "lodash";
import { Controller } from "stimulus";
import TaffrailAdvice from "../taffrailapi";
import Turbolinks from "turbolinks";
import qs from "querystring";
import Handlebars from "handlebars";
export default class extends Controller {
  // static targets = ["title", "description"];
  // static values = { id: String };

  connect() {
    // console.log("CONNECTED profile")
  }

  initialize() {
    // advicsetId = this.idValue

    this.TaffrailAdvice = new TaffrailAdvice();
    this.TaffrailAdvice.init();

    // when data is updated after page-load, use this fn
    this.TaffrailAdvice.$loadingContainer = $(".advice-outer-container");
    this.TaffrailAdvice.updateFn = (data, initial = false) => {
      // update content
      this.updatePanes();
      this.TaffrailAdvice.updatePanes();
      // save state
      const loc = `${window.location.pathname}?${qs.stringify(_.omit(this.TaffrailAdvice.api.params, this.TaffrailAdvice.paramsToOmit))}`;
      if (initial) {// on init, use REPLACE
        Turbolinks.controller.replaceHistoryWithLocationAndRestorationIdentifier(loc, Turbolinks.uuid());
      } else {
        Turbolinks.controller.pushHistoryWithLocationAndRestorationIdentifier(loc, Turbolinks.uuid());
      }
    }

    // current querystring without "?" prefix
    const querystring = location.search.substr(1);
    this.TaffrailAdvice.load(querystring).then(api => {
      // DOM updates
      this.TaffrailAdvice.updateFn(api, "initial page load");
    });
  }

  /**
   * Update 3 panes. This fn is called each time the API updates.
   */
  updatePanes() {
    this.TaffrailAdvice.mapData();
    this.updateMainPane();
    this.TaffrailAdvice.updateAssumptionsList();
  }

  updateMainPane() {
    const { api } = this.TaffrailAdvice;
    // render
    if (api.display.type == "INPUT_REQUEST") {
      // $(".advice").slideDown(300);
      this.TaffrailAdvice.updateForInputRequest();
    } else {
      // must be advice
      if (api.display._isLast) {
        // since it's "last", hide the question.
        // $(".advice").slideUp(300);

        // save "budget"
        const prof = window.jga.UserProfile.savedProfile;
        const budget = _.omit(api.params, "State", "include", "showcase");
        window.jga.UserProfile.savedProfile = _.assign(prof, budget, { budgetcreated: true });
        $(document).trigger("pushnotification", ["budget", { message: "Savings budget saved!" }]);
      }

      $(".goal-result").show();

      const str = Handlebars.compile($("#tmpl_advice_profile").html())(api);
      this.TaffrailAdvice.$advice.html(str);
    }

  }
}
