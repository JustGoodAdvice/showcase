import algoliasearch from "algoliasearch/lite";
import { connectHits } from "instantsearch.js/es/connectors";
import instantsearch from "instantsearch.js";
import { analytics, configure, searchBox, stats } from "instantsearch.js/es/widgets";
import qs from "querystring";
const { appId, searchKey, index } = window.jga.algolia;
const OWNER_ID = "JU";

export default class UserQuestionInstantSearch {
  constructor({ initialQuery }) {
    // https://www.algolia.com/doc/api-reference/widgets/instantsearch/js/#widget-param-initialuistate
    const initialUiState = {
      [index]: { // initial state goes into default index property
        refinementList: {
          // filter Advice Sets by default
          "entityType.displayName": ["Advice Set"],
          "adviceset.isStarter": true,
        },
        query: initialQuery
      }
    };
    const searchClient = algoliasearch(appId, searchKey);
    const search = instantsearch({
      indexName: index,
      searchClient,
      routing: false,
      initialUiState
    });

    const searchParameters = {
      distinct: true,
      hitsPerPage: 10,
    };

    // restrict bulk editing to Advice Sets and content owned by current user only
    searchParameters.filters = `ownerId:"${OWNER_ID}" AND entityType.displayName:"Advice Set" AND adviceset.aiUserRequestCount > 0 AND adviceset.isStarter = 1`;

    const renderItem = (item) => {
      // console.log(item._highlightResult)
      const {
        adviceset: {
          id: ruleSetId,
          name: adviceSetTopic,
          aiUserRequests = []
        },
        ownerId,
        _highlightResult: {
          adviceset: {
            name: {
              value: adviceSetTopicHighlighted
            },
            aiUserRequests: aiUserRequestsHighlighted = []
          }
        }
      } = item;

      let aiUserRequestsStack = "";
      aiUserRequests.forEach(ur => {
        aiUserRequestsStack += `<li>${ur.request}</li>`
      });

      return `<div class="position-relative" data-ruleset-id="${ruleSetId}" data-adviceset-id="${ownerId}${ruleSetId}">
				<a href="/s/${ownerId}${ruleSetId}/virtual-assistant/?${qs.stringify(window.jga.api.params)}" class="stretched-link">${adviceSetTopic}</a>
				<br>
				<ol>
					${aiUserRequestsStack}
				</ol>
			</div>`
    }

    const renderHits = (renderOptions, isFirstRender) => {
      const { hits, widgetParams } = renderOptions;

      if (!isFirstRender && !hits.length) {
        // when there's no results...
        $(widgetParams.container).html("No results were found with your current filters.");
      } else {
        $(widgetParams.container).html(hits.map(renderItem).join(""))
      }
    };

    // Create the custom widget
    const customHits = connectHits(renderHits);

    let timerId;
    search.addWidgets([
      configure(searchParameters),
      analytics({
        pushFunction(formattedParameters, state, results) {
          // eslint-disable-next-line new-cap
          Intercom("trackEvent", "searched-userquestion", state.query);
          // send it
          // https://developers.google.com/analytics/devguides/collection/analyticsjs/pages
          window.ga("send", "event", "search-userquestion", "query", state.query);
        },
      }),
      searchBox({
        container: "#searchbox",
        placeholder: "Try typing '401k'...",
        showLoadingIndicator: true,
        autofocus: false,
        cssClasses: {
          input: ["form-control form-control-lg"]
        },
        // https://www.algolia.com/doc/guides/building-search-ui/going-further/improve-performance/js/#debouncing
        queryHook(query, search) {
          clearTimeout(timerId);
          timerId = setTimeout(() => {
            return search(query);
          }, 250);
        },
      }),
      customHits({
        container: "#typeahead_results"
      }),
      stats({ container: "#stats" }),
    ]);

    search.start();
  }
}