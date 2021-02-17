import _ from "lodash";
import { Controller } from "stimulus";
import TaffrailAdvice from "../taffrailapi";
import Turbolinks from "turbolinks";
import qs from "querystring";


export default class extends Controller {
  // static targets = ["title", "description"];
  // static values = { id: String };

  connect() {
    console.log("CONNECTED save for home")
  }

  initialize() {
    // advicsetId = this.idValue

    $("#breadcrumb").html("&nbsp;/&nbsp;Save for a home");

    this.TaffrailAdvice = new TaffrailAdvice();
    this.TaffrailAdvice.init();

    // when data is updated after page-load, use this fn
    this.TaffrailAdvice.$loadingContainer = $("main.screen");
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
    // default values for this adviceset
    const defaults = {
      Homeowner_Association_Fees: 0,
      Homeowner_Insurance_Costs_Monthly: 1000/12,
      // Home_Property_Taxes: 5000,
      Mortgage_Down_Payment_Pct: .2,
      Mortgage_Insurance_Per_Month: 0,
      Mortgage_Interest_Rate: .03,
      Mortgage_Term_Years: 30,
    }
    const data = qs.stringify(_.extend(defaults, qs.parse(querystring)));
    this.TaffrailAdvice.load(data, $("main.screen")).then(api => {
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
    // render
    if (this.TaffrailAdvice.api.display.type == "INPUT_REQUEST") {
      // $(".advice").slideDown(300);
      this.TaffrailAdvice.updateForInputRequest();
    } else {
      // must be advice
      if (this.TaffrailAdvice.api.display._isLast) {
        // since it's "last", hide the question.
        // $(".advice").slideUp(300);
      }
      this.TaffrailAdvice.updateForAdvice();
    }

  }
}
