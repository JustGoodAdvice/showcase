import "@stimulus/polyfills"
import { Application } from "stimulus"
import { definitionsFromContext } from "stimulus/webpack-helpers"
import Turbolinks from "turbolinks";
import UserProfile from "./frb/profile";
import Handlebars from "handlebars";
import qs from "querystring";

const application = Application.start();
const context = require.context("./frb/controllers", true, /\.js$/);
application.load(definitionsFromContext(context));

Turbolinks.start();
Turbolinks.setProgressBarDelay(100);

// redo this on page loads
document.addEventListener("turbolinks:load", () => {
  if (window.jga.UserProfile) {
    window.jga.UserProfile.reinit();
  } else {
    window.jga.UserProfile = new UserProfile();
  }
});

/**
 * handler for madlib-style dropdowns for 'get started' button
 */
$(document).on("click", ".madlib a.dropdown-item", e => {
  e.preventDefault();
  const $this = $(e.currentTarget);
  const { taffrailVar, varValue } = $this.data();
  const selText = $this.text();

  $this.closest(".btn-group").find(".dropdown-toggle")
    .text(selText)
    .attr("data-var-selected", varValue ? `${taffrailVar}|${varValue}` : null)
    .data("var-selected", varValue ? `${taffrailVar}|${varValue}` : null)
  ;

  const [baseLink] = $(".get-started").prop("href").split("?");

  const allNamePipeVal = $this.parents(".madlib").find(".dropdown-toggle[data-var-selected]");
  if (allNamePipeVal.length){
    const vars = {}
    $.each(allNamePipeVal, (i, el) => {
      const { varSelected } = $(el).data();
      const [name,value] = varSelected.split("|");
      vars[name] = value;
    });
    const newLink = `${baseLink}?${qs.stringify(vars)}`;
    $(".get-started").prop("href", newLink);
  } else {
    $(".get-started").prop("href", baseLink);
  }
});

/**
 * push notifications
 */
$(document).on("pushnotification", (e, evtname, detail) => {
  const id = `${evtname}_${Date.now()}`;
  detail.id = id;
  if (!detail.title) { detail.title = "First Republic"; }
  detail.time = "Now";
  const toast = Handlebars.compile($("#tmpl_toast").html())(detail);
  // insert into DOM
  $("#toastWrapper").show();
  $("#toastContainer").append(toast);
  // init Toast component
  $(`#${id}`).toast({
    delay: 2000
  }).on("hidden.bs.toast", () => {
    $(this).remove(); // remove it when it's been hidden
    $("#toastWrapper").hide();
  }).toast("show"); // finally show it
});
