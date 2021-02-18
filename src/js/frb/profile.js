import _ from "lodash";
import store from "store";
export default class {
  constructor(){
    this.handleClickActivatePersona();
    this.reinit();
  }

  reinit() {
    this.activateCurrentPersona();
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
    this.emit("activated", { profile, message: `Profile set for ${profile._name}` });
    window.location.reload();
  }

  deactivatePersona() {
    this.savedProfile = null;
    this.deactivateCurrentPersona();
    this.emit("deactivated", { message: "Profile deactivated" });
    window.location.reload();
  }

  emit(name, detail) {
    $(document).trigger("pushnotification", [name, detail]);
  }
}
