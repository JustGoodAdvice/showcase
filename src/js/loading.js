import _ from "lodash";

class AjaxLoading {
  static get Handlebars() {
    return this._Handlebars;
  }
  static set Handlebars(h) {
    this._Handlebars = h;
  }
  /**
   * Show a mask + loader over a container to indicate loading
   * @param {jQuery} $container jQuery container element
   * @param {string=} ajaxId Unique ID for spinner
   */
  static show($container, ajaxId = _.uniqueId("loading"), usePlaceholder = false) {
    if ($(`#loader_${ajaxId}`).length) {
      this.hideAjaxLoader(ajaxId);
    }

    // newer versions of the showcase use the placeholder-loading animation
    if (usePlaceholder) {
      $(".center-ph-loader")
        .removeAttr("id")
        .attr("id",`loader_${ajaxId}`)
        .show()
      ;
    } else {
      const imgWH = 44;
      const imgPath = "/img/Spinner-1s-200px.svg";
      const height = $container.outerHeight();
      const width = $container.outerWidth();
      const containerPosition = $container.offset();
      const imageTopPosition = containerPosition.top + ((height - imgWH) / 2); // center loader vertically
      const imageLeftPosition = containerPosition.left + ((width - imgWH) / 2); // center horizontally

      // attach mask
      $("<div />")
        .attr("id", `loader_${ajaxId}`)
        .addClass("loading-mask")
        .css({
          top: containerPosition.top,
          left: containerPosition.left,
          height: height,
          width: width
        })
        .appendTo("body")
      ;

      // attach spinner
      $(`<img src="${imgPath}" />`)
        .attr({
          id: `loader_spinner_${ajaxId}`,
          height: imgWH,
          width: imgWH
        })
        .addClass("loading-spinner")
        .css({
          height: imgWH,
          left: imageLeftPosition,
          top: imageTopPosition,
          width: imgWH
        })
        .appendTo("body")
      ;
    }

    return ajaxId;
  }

  /**
   * Remove mask + loader over a container to indicate loading
   * @param {string} ajaxId ID of spinner to remove
   */
  static hide(ajaxId, all = false){
    $(`#loader_spinner_${ajaxId}`).remove();
    const $loader = $(`#loader_${ajaxId}`);
    if ($loader.hasClass("center-ph-loader")){
      $loader.hide();
    } else {
      $loader.remove();
    }

    if (all) {
      $("#__loading__").hide();
    }
  }

  static showLong($container, ajaxId, timer, data) {
    // const { adviceset } = data;
    // const { adviceScenarios, aiUserRequests, entity, owner: { name: ownerName }, publishing, tags, _links } = adviceset;
    // // const { description, reservedName } = entity;
    // // const { advicebuilder } = _links;

    // data.hasAdviceScenarios = adviceScenarios.length;
    // data.hasAiUserRequests = aiUserRequests.length;
    // data.hasTags = tags.length;

    AjaxLoading.hide(ajaxId);

    const $div = $("#__loading__").show().find(".long-loader");
    const tmpl = this.Handlebars.compile($("#tmpl_loadingLong").html());

    if (timer == 75) {
      $div.html(tmpl({
        naut: {
          word: "Oops!",
          description: "Becalmed: unable to move due to a lack of wind. <strong class='text-danger'>Try refreshing</strong>."
        }
      }));
      $div.find(".slideDown").slideDown();
    } else {
      $.getJSON("/api/naut").then(obj => {
        data.naut = obj;
        data.ajaxId = _.uniqueId(ajaxId + "_")
        data.timer = timer;
        $div.html(tmpl(data));
        $div.find(".slideDown").slideDown();
      });
    }
  }
}

export default AjaxLoading;
