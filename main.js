import EventBuddy from "./eventbuddy.js";

window.app = new EventBuddy();

window.onload = function () {
    window.app.init();
};
