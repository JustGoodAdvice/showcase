import _ from "lodash";
import store from "store";
import Turbolinks from "turbolinks";
import UserGoals from "./goals";
export default class {
  constructor(){
    this.handleClickActivatePersona();
    this.reinit(true);
  }

  reinit(isFirstLoad = false) {
    this.activateCurrentPersona();
    this.goals = new UserGoals(this.savedProfile, isFirstLoad);
  }

  get PERSONAS() {
    return window.jga.PERSONAS;
  }

  get savedProfile(){
    return store.get("frb_user_profile", {});
  }

  set savedProfile(data) {
    store.set("frb_user_profile", data);
  }

  // pass { name: value }
  buildProfileWith(nv) {
    const prof = this.savedProfile;
    const newProfile = _.assign(prof, nv);
    this.savedProfile = newProfile;
  }

  handleClickActivatePersona() {
    $(document).on("click", "a[data-select-persona]", e => {
      e.preventDefault();
      const $el = $(e.currentTarget);
      const { selectPersona } = $el.data();
      if (selectPersona == "reset") {
        this.deactivatePersona();
        return;
      }
      this.activatePersona(selectPersona);
    });
  }

  activateCurrentPersona() {
    if (!this.savedProfile) { return; }
    this.deactivateCurrentPersona()
      .filter(`[data-select-persona="${this.savedProfile._name}"]`)
      .addClass("active");
  }

  deactivateCurrentPersona() {
    return $("body").find("a[data-select-persona]").removeClass("active");
  }

  activatePersona(persona) {
    const profile = this.PERSONAS[persona];
    if (!profile) {
      throw new Error("Persona not matched");
    }
    this.savedProfile = profile;
    this.activateCurrentPersona();
    // this.emit("activated", { profile, message: `Profile set for ${profile._name}` });

    // go to profile to force "profile" goal save
    Turbolinks.visit("/frb/v2/goal-planning/goals/taffrail/JUsIoPDhkNcvs1zb8UErR1I");
  }

  deactivatePersona() {
    this.savedProfile = null;
    this.deactivateCurrentPersona();
    // clear goals
    this.goals.savedGoals = [];
    // reset budget creation
    this.buildProfileWith({ budgetcreated: false });
    // this.emit("deactivated", { message: "Profile deactivated" });
    window.location.reload();
  }

  emit(name, detail) {
    $(document).trigger("pushnotification", [name, detail]);
  }
}
