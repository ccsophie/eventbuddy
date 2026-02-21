import EventItem from "./event.js";
import Tag from "./tag.js";
import Participant from "./participant.js";

export default class EventBuddy {
    #events = [];
    #tags = [];
    #participants = [];
    #selectedEventId = null;

    // --- Auth (Demo) ---
    #currentUser = null; // {id, email, name}

    init() {
        this.#loadAll();

        // Login-Pflicht
        this.#ensureAuth();

        // Falls eingeloggt -> UI starten
        if (this.#currentUser) {
            this.#initUI();
            this.#renderFilters();
            this.#renderEventList();
            this.#addEventHandlers();
        }
    }

    // =========================
    // STORAGE
    // =========================
    #loadAll() {
        // Current user
        const userRaw = localStorage.getItem("eb_currentUser");
        this.#currentUser = userRaw ? JSON.parse(userRaw) : null;

        // App data
        const raw = localStorage.getItem("eb_data");
        if (raw) {
            const data = JSON.parse(raw);

            this.#tags = (data.tags ?? []).map((t) => new Tag(t));
            this.#participants = (data.participants ?? []).map((p) => new Participant(p));

            // IMPORTANT: events brauchen zusätzlich invitations
            this.#events = (data.events ?? []).map((e) => {
                const ev = new EventItem(e);
                // fallback, falls alte Daten noch ohne invitations sind
                ev.invitations = e.invitations ?? {}; // { participantId: {status, mail, sentAt} }
                return ev;
            });
        } else {
            this.#seedDummyData();
            this.#saveAll();
        }
    }

    #saveAll() {
        const data = {
            tags: this.#tags.map((t) => ({ id: t.id, name: t.name })),
            participants: this.#participants.map((p) => ({
                id: p.id,
                name: p.name,
                email: p.email,
                avatar: p.avatar ?? "",
            })),
            events: this.#events.map((e) => ({
                id: e.id,
                title: e.title,
                datetime: e.datetime,
                location: e.location,
                description: e.description,
                status: e.status,
                tagIds: e.tagIds,
                participantIds: e.participantIds,
                invitations: e.invitations ?? {},
            })),
        };

        localStorage.setItem("eb_data", JSON.stringify(data));
    }

    // =========================
    // AUTH
    // =========================
    #ensureAuth() {
        if (this.#currentUser) return;

        const dlg = document.getElementById("authModal");
        dlg.innerHTML = `
      <form method="dialog" class="modal__content" id="authForm">
        <h3>Login / Registrierung</h3>

        <label class="field">
          <span class="field__label">Name</span>
          <input class="field__input" name="name" placeholder="z.B. Sophie" required>
        </label>

        <label class="field">
          <span class="field__label">E-Mail</span>
          <input class="field__input" type="email" name="email" placeholder="name@mail.at" required>
        </label>

        <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:12px;">
          <button class="btn btn--primary" id="btnLogin" value="default">Login</button>
        </div>
      </form>
    `;

        const form = dlg.querySelector("#authForm");
        form.addEventListener("submit", (e) => {
            e.preventDefault();
            const fd = new FormData(form);
            const name = fd.get("name").toString().trim();
            const email = fd.get("email").toString().trim().toLowerCase();

            this.#currentUser = { id: Date.now(), name, email };
            localStorage.setItem("eb_currentUser", JSON.stringify(this.#currentUser));

            dlg.close();

            // UI starten
            this.#initUI();
            this.#renderFilters();
            this.#renderEventList();
            this.#addEventHandlers();
        });

        dlg.showModal();
    }

    #logout() {
        localStorage.removeItem("eb_currentUser");
        location.reload();
    }

    // =========================
    // UI INIT
    // =========================
    #initUI() {
        this.#fillDetail(null);
        document.getElementById("btnEditEvent").disabled = true;
        document.getElementById("btnDeleteEvent").disabled = true;
    }

    #addEventHandlers() {
        // Eventliste auswählen (Delegation)
        document.getElementById("eventList").addEventListener("click", (e) => {
            const item = e.target.closest(".eventlist__item");
            if (!item) return;
            this.#selectEvent(Number(item.dataset.eventId));
        });

        // Filter
        document.getElementById("filterStatus").addEventListener("change", () => this.#renderEventList());
        document.getElementById("filterTag").addEventListener("change", () => this.#renderEventList());
        document.getElementById("filterParticipant").addEventListener("change", () => this.#renderEventList());
        document.getElementById("searchEvents").addEventListener("input", () => this.#renderEventList());

        // + Event
        document.getElementById("btnNewEvent").addEventListener("click", () => {
            this.#openEventForm(null);
        });

        // Bearbeiten
        document.getElementById("btnEditEvent").addEventListener("click", () => {
            if (this.#selectedEventId == null) return;
            const ev = this.#events.find((e) => e.id === this.#selectedEventId);
            this.#openEventForm(ev);
        });

        // Löschen
        document.getElementById("btnDeleteEvent").addEventListener("click", () => {
            if (this.#selectedEventId == null) return;
            const ok = confirm("Event wirklich löschen?");
            if (!ok) return;

            this.#events = this.#events.filter((e) => e.id !== this.#selectedEventId);
            this.#selectedEventId = null;

            this.#saveAll();
            this.#renderEventList();
            this.#fillDetail(null);

            document.getElementById("btnEditEvent").disabled = true;
            document.getElementById("btnDeleteEvent").disabled = true;
        });

        // Tags verwalten
        document.getElementById("btnManageTags").addEventListener("click", () => {
            this.#openTagsModal();
        });

        // Teilnehmer verwalten
        document.getElementById("btnManageParticipants").addEventListener("click", () => {
            this.#openParticipantsModal();
        });

        // Logout
        document.getElementById("btnLogout").addEventListener("click", () => this.#logout());
    }

    // =========================
    // EVENT FORM (Tags + Teilnehmer)
    // =========================
    #openEventForm(ev = null) {
        const dlg = document.getElementById("eventFormModal");
        const isEdit = !!ev;

        dlg.innerHTML = `
      <form method="dialog" class="modal__content" id="eventForm">
        <h3>${isEdit ? "Event bearbeiten" : "Neues Event"}</h3>

        <label class="field">
          <span class="field__label">Titel</span>
          <input class="field__input" name="title" required value="${isEdit ? this.#esc(ev.title) : ""}">
        </label>

        <label class="field">
          <span class="field__label">Datum & Uhrzeit</span>
          <input class="field__input" type="datetime-local" name="datetime" required
                 value="${isEdit ? this.#toDatetimeLocal(ev.datetime) : ""}">
        </label>

        <label class="field">
          <span class="field__label">Ort</span>
          <input class="field__input" name="location" required value="${isEdit ? this.#esc(ev.location) : ""}">
        </label>

        <label class="field">
          <span class="field__label">Status</span>
          <select class="field__input" name="status">
            <option value="planned" ${isEdit && ev.status === "planned" ? "selected" : ""}>geplant</option>
            <option value="done" ${isEdit && ev.status === "done" ? "selected" : ""}>abgeschlossen</option>
          </select>
        </label>

        <label class="field">
          <span class="field__label">Beschreibung</span>
          <textarea class="field__input" name="description" rows="3">${isEdit ? this.#esc(ev.description) : ""}</textarea>
        </label>

        <fieldset class="field">
          <legend class="field__label">Tags</legend>
          <div class="checkgrid">
            ${this.#tags
            .map(
                (t) => `
              <label class="check">
                <input type="checkbox" name="tagIds" value="${t.id}"
                  ${isEdit && (ev.tagIds ?? []).includes(t.id) ? "checked" : ""}>
                <span>${this.#esc(t.name)}</span>
              </label>
            `
            )
            .join("")}
          </div>
        </fieldset>

        <fieldset class="field">
          <legend class="field__label">TeilnehmerIn</legend>
          <div class="checkgrid">
            ${this.#participants
            .map(
                (p) => `
              <label class="check">
                <input type="checkbox" name="participantIds" value="${p.id}"
                  ${isEdit && (ev.participantIds ?? []).includes(p.id) ? "checked" : ""}>
                <span>${this.#esc(p.name)} (${this.#esc(p.email)})</span>
              </label>
            `
            )
            .join("")}
          </div>
        </fieldset>

        <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:12px;">
          <button class="btn btn--ghost" type="button" id="btnCancelEvent">Abbrechen</button>
          <button class="btn btn--primary" type="submit">${isEdit ? "Speichern" : "Anlegen"}</button>
        </div>
      </form>
    `;

        dlg.querySelector("#btnCancelEvent").addEventListener("click", () => dlg.close());

        const form = dlg.querySelector("#eventForm");
        form.addEventListener("submit", (e) => {
            e.preventDefault();
            this.#saveEventFromForm(form, ev);
            dlg.close();
        });

        dlg.showModal();
    }

    #saveEventFromForm(form, ev) {
        const fd = new FormData(form);

        const title = fd.get("title").toString().trim();
        const datetimeLocal = fd.get("datetime").toString(); // "YYYY-MM-DDTHH:MM"
        const location = fd.get("location").toString().trim();
        const description = fd.get("description").toString().trim();
        const status = fd.get("status").toString();

        const tagIds = fd.getAll("tagIds").map((x) => Number(x));
        const participantIds = fd.getAll("participantIds").map((x) => Number(x));

        if (!title || !datetimeLocal || !location) return;

        const datetime = datetimeLocal.length === 16 ? `${datetimeLocal}:00` : datetimeLocal;

        // Für Einladungen: wer ist "neu" dazugekommen?
        const oldParticipantIds = ev ? (ev.participantIds ?? []) : [];
        const added = this.#diffAdded(oldParticipantIds, participantIds);

        // Invitations Objekt übernehmen (bei edit) oder neu
        const invitations = ev ? { ...(ev.invitations ?? {}) } : {};

        // Für alle neu hinzugefügten Teilnehmer: Demo-Mail erzeugen + Status "random"
        for (const pid of added) {
            const p = this.#participants.find((x) => x.id === pid);
            if (!p) continue;

            const randomStatus = this.#randomInviteStatus(); // accepted/declined/pending
            const mail = this.#buildInviteMail(p, { title, datetime, location, description });

            invitations[String(pid)] = {
                status: randomStatus,
                mail,
                sentAt: new Date().toISOString(),
            };
        }

        // Für entfernte Teilnehmer: invitations optional löschen (damit sauber bleibt)
        const removed = this.#diffRemoved(oldParticipantIds, participantIds);
        for (const pid of removed) {
            delete invitations[String(pid)];
        }

        if (ev) {
            // Update
            const idx = this.#events.findIndex((e) => e.id === ev.id);
            this.#events[idx] = new EventItem({
                id: ev.id,
                title,
                datetime,
                location,
                description,
                status,
                tagIds,
                participantIds,
            });
            // invitations wieder anhängen (EventItem kennt das evtl. nicht als Feld)
            this.#events[idx].invitations = invitations;

            this.#selectedEventId = ev.id;
        } else {
            // Create
            const newId = Date.now();
            const newEv = new EventItem({
                id: newId,
                title,
                datetime,
                location,
                description,
                status,
                tagIds,
                participantIds,
            });
            newEv.invitations = invitations;

            this.#events.unshift(newEv);
            this.#selectedEventId = newId;
        }

        this.#saveAll();
        this.#renderEventList();

        const current = this.#events.find((e) => e.id === this.#selectedEventId);
        this.#fillDetail(current);

        document.getElementById("btnEditEvent").disabled = false;
        document.getElementById("btnDeleteEvent").disabled = false;
    }

    // =========================
    // TAGS CRUD (wie Teilnehmer)
    // =========================
    #openTagsModal() {
        const dlg = document.getElementById("tagsModal"); // <-- brauchst du im HTML als <dialog id="tagsModal"></dialog>

        const render = () => {
            dlg.innerHTML = `
        <form method="dialog" class="modal__content" id="tagsForm">
          <h3>Tags verwalten</h3>

          <div style="display:flex; gap:10px; margin-bottom:12px;">
            <input class="field__input" id="tName" placeholder="Tag-Name (z.B. Sport)">
            <button class="btn btn--primary" type="button" id="btnAddT">Hinzufügen</button>
          </div>

          <div>
            ${this.#tags.length === 0 ? `<p style="opacity:.7;">Noch keine Tags.</p>` : ""}
            <ul style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:8px;">
              ${this.#tags
                .map(
                    (t) => `
                <li style="display:flex; gap:10px; align-items:center; justify-content:space-between; border:1px solid var(--border); padding:10px; border-radius:12px;">
                  <div style="font-weight:600;">${this.#esc(t.name)}</div>
                  <div style="display:flex; gap:8px;">
                    <button class="btn btn--ghost" type="button" data-edit="${t.id}">Bearbeiten</button>
                    <button class="btn btn--ghost" type="button" data-del="${t.id}">Löschen</button>
                  </div>
                </li>
              `
                )
                .join("")}
            </ul>
          </div>

          <div style="display:flex; justify-content:flex-end; margin-top:12px;">
            <button class="btn btn--ghost" type="button" id="btnCloseT">Schließen</button>
          </div>
        </form>
      `;

            dlg.querySelector("#btnCloseT").addEventListener("click", () => dlg.close());

            dlg.querySelector("#btnAddT").addEventListener("click", () => {
                const name = dlg.querySelector("#tName").value.trim();
                if (!name) return;

                // simple unique check
                if (this.#tags.some((x) => x.name.toLowerCase() === name.toLowerCase())) {
                    alert("Diesen Tag gibt es schon.");
                    return;
                }

                this.#tags.push(new Tag({ id: Date.now(), name }));
                this.#saveAll();

                render();
                this.#renderFilters(); // Dropdown aktualisieren
            });

            dlg.querySelectorAll("[data-del]").forEach((btn) => {
                btn.addEventListener("click", () => {
                    const id = Number(btn.dataset.del);
                    const ok = confirm("Tag wirklich löschen?");
                    if (!ok) return;

                    // Tag entfernen
                    this.#tags = this.#tags.filter((t) => t.id !== id);

                    // Aus allen Events tagIds entfernen
                    this.#events = this.#events.map((ev) => {
                        const clone = this.#eventToPlain(ev);
                        clone.tagIds = (clone.tagIds ?? []).filter((tid) => tid !== id);
                        const e2 = new EventItem(clone);
                        e2.invitations = ev.invitations ?? {};
                        return e2;
                    });

                    this.#saveAll();
                    render();
                    this.#renderFilters();
                    this.#renderEventList();

                    if (this.#selectedEventId) {
                        this.#fillDetail(this.#events.find((e) => e.id === this.#selectedEventId));
                    }
                });
            });

            dlg.querySelectorAll("[data-edit]").forEach((btn) => {
                btn.addEventListener("click", () => {
                    const id = Number(btn.dataset.edit);
                    const t = this.#tags.find((x) => x.id === id);
                    if (!t) return;

                    const newName = prompt("Tag-Name:", t.name);
                    if (newName === null) return;

                    const nameTrim = newName.trim();
                    if (!nameTrim) return;

                    if (this.#tags.some((x) => x.id !== id && x.name.toLowerCase() === nameTrim.toLowerCase())) {
                        alert("Diesen Tag gibt es schon.");
                        return;
                    }

                    const idx = this.#tags.findIndex((x) => x.id === id);
                    this.#tags[idx] = new Tag({ id, name: nameTrim });

                    this.#saveAll();
                    render();
                    this.#renderFilters();
                    if (this.#selectedEventId) {
                        this.#fillDetail(this.#events.find((e) => e.id === this.#selectedEventId));
                    }
                });
            });
        };

        render();
        dlg.showModal();
    }

    // =========================
    // PARTICIPANTS CRUD (deins, leicht sauber gehalten)
    // =========================
    #openParticipantsModal() {
        const dlg = document.getElementById("participantsModal");

        const render = () => {
            dlg.innerHTML = `
        <form method="dialog" class="modal__content" id="participantsForm">
          <h3>TeilnehmerIn verwalten</h3>

          <div style="display:flex; gap:10px; margin-bottom:12px;">
            <input class="field__input" id="pName" placeholder="Name">
            <input class="field__input" id="pEmail" placeholder="E-Mail">
            <input class="field__input" id="pAvatar" placeholder="Kürzel/Avatar (optional)" style="max-width:180px;">
            <button class="btn btn--primary" type="button" id="btnAddP">Hinzufügen</button>
          </div>

          <div>
            ${this.#participants.length === 0 ? `<p style="opacity:.7;">Noch keine Teilnehmer.</p>` : ""}
            <ul style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:8px;">
              ${this.#participants
                .map(
                    (p) => `
                <li style="display:flex; gap:10px; align-items:center; justify-content:space-between; border:1px solid var(--border); padding:10px; border-radius:12px;">
                  <div>
                    <div style="font-weight:600;">${this.#esc(p.name)} ${p.avatar ? `(${this.#esc(p.avatar)})` : ""}</div>
                    <div style="opacity:.7; font-size:13px;">${this.#esc(p.email)}</div>
                  </div>
                  <div style="display:flex; gap:8px;">
                    <button class="btn btn--ghost" type="button" data-edit="${p.id}">Bearbeiten</button>
                    <button class="btn btn--ghost" type="button" data-del="${p.id}">Löschen</button>
                  </div>
                </li>
              `
                )
                .join("")}
            </ul>
          </div>

          <div style="display:flex; justify-content:flex-end; margin-top:12px;">
            <button class="btn btn--ghost" type="button" id="btnCloseP">Schließen</button>
          </div>
        </form>
      `;

            dlg.querySelector("#btnCloseP").addEventListener("click", () => dlg.close());

            dlg.querySelector("#btnAddP").addEventListener("click", () => {
                const name = dlg.querySelector("#pName").value.trim();
                const email = dlg.querySelector("#pEmail").value.trim().toLowerCase();
                const avatar = dlg.querySelector("#pAvatar").value.trim();

                if (!name || !email) return;

                if (this.#participants.some((x) => x.email.toLowerCase() === email)) {
                    alert("Diese E-Mail gibt es schon.");
                    return;
                }

                this.#participants.push(new Participant({ id: Date.now(), name, email, avatar }));
                this.#saveAll();
                render();
                this.#renderFilters();
            });

            dlg.querySelectorAll("[data-del]").forEach((btn) => {
                btn.addEventListener("click", () => {
                    const id = Number(btn.dataset.del);
                    const ok = confirm("TeilnehmerIn wirklich löschen?");
                    if (!ok) return;

                    this.#participants = this.#participants.filter((p) => p.id !== id);

                    // Teilnehmer aus allen Events entfernen + invitation löschen
                    this.#events = this.#events.map((ev) => {
                        const clone = this.#eventToPlain(ev);
                        clone.participantIds = (clone.participantIds ?? []).filter((pid) => pid !== id);
                        const e2 = new EventItem(clone);

                        const inv = { ...(ev.invitations ?? {}) };
                        delete inv[String(id)];
                        e2.invitations = inv;

                        return e2;
                    });

                    this.#saveAll();
                    render();
                    this.#renderEventList();
                    this.#renderFilters();

                    if (this.#selectedEventId) {
                        this.#fillDetail(this.#events.find((e) => e.id === this.#selectedEventId));
                    }
                });
            });

            dlg.querySelectorAll("[data-edit]").forEach((btn) => {
                btn.addEventListener("click", () => {
                    const id = Number(btn.dataset.edit);
                    const p = this.#participants.find((x) => x.id === id);
                    if (!p) return;

                    const newName = prompt("Name:", p.name);
                    if (newName === null) return;

                    const newEmail = prompt("E-Mail:", p.email);
                    if (newEmail === null) return;

                    const newAvatar = prompt("Kürzel/Avatar (optional):", p.avatar ?? "");
                    if (newAvatar === null) return;

                    const emailLower = newEmail.trim().toLowerCase();
                    if (this.#participants.some((x) => x.id !== id && x.email.toLowerCase() === emailLower)) {
                        alert("Diese E-Mail gibt es schon.");
                        return;
                    }

                    const idx = this.#participants.findIndex((x) => x.id === id);
                    this.#participants[idx] = new Participant({
                        id,
                        name: newName.trim(),
                        email: emailLower,
                        avatar: newAvatar.trim(),
                    });

                    this.#saveAll();
                    render();
                    this.#renderFilters();

                    if (this.#selectedEventId) {
                        this.#fillDetail(this.#events.find((e) => e.id === this.#selectedEventId));
                    }
                });
            });
        };

        render();
        dlg.showModal();
    }

    // =========================
    // LIST + DETAIL
    // =========================
    #selectEvent(id) {
        this.#selectedEventId = id;

        document
            .querySelectorAll(".eventlist__item")
            .forEach((li) => li.classList.remove("eventlist__item--active"));
        const active = document.querySelector(`.eventlist__item[data-event-id="${id}"]`);
        if (active) active.classList.add("eventlist__item--active");

        const ev = this.#events.find((x) => x.id === id);
        this.#fillDetail(ev);

        document.getElementById("btnEditEvent").disabled = false;
        document.getElementById("btnDeleteEvent").disabled = false;
    }

    #renderFilters() {
        const tagSelect = document.getElementById("filterTag");
        this.#fillSelect(tagSelect, this.#tags.map((t) => ({ value: t.id, label: t.name })));

        const partSelect = document.getElementById("filterParticipant");
        this.#fillSelect(partSelect, this.#participants.map((p) => ({ value: p.id, label: p.name })));
    }

    #fillSelect(selectEl, options) {
        const keepFirst = selectEl.querySelector("option[value='all']");
        selectEl.replaceChildren();
        selectEl.appendChild(keepFirst);

        for (const opt of options) {
            const o = document.createElement("option");
            o.value = String(opt.value);
            o.textContent = opt.label;
            selectEl.appendChild(o);
        }
    }

    #renderEventList() {
        const list = document.getElementById("eventList");
        const noResults = document.getElementById("noResultsMessage");

        // Liste leeren
        list.replaceChildren();

        // Filtern
        const filtered = this.#applyFilters(this.#events);

        // Hinweis ein-/ausblenden
        if (noResults) {
            noResults.hidden = filtered.length !== 0;
        }

        // Events rendern
        for (const ev of filtered) {
            const li = document.createElement("li");
            li.className = "eventlist__item";
            li.dataset.eventId = String(ev.id);

            const meta = document.createElement("div");
            meta.className = "eventlist__meta";

            const name = document.createElement("div");
            name.className = "eventlist__name";
            name.textContent = ev.title;

            const info = document.createElement("div");
            info.className = "eventlist__info";
            info.textContent = `${this.#formatDateTime(ev.datetime)} · ${ev.location}`;

            meta.appendChild(name);
            meta.appendChild(info);

            const status = document.createElement("span");
            status.className = "eventlist__status";
            status.textContent = ev.status === "planned" ? "geplant" : "abgeschlossen";

            li.appendChild(meta);
            li.appendChild(status);

            list.appendChild(li);
        }

        // Wenn das ausgewählte Event durch Filter nicht mehr sichtbar ist 
        if (this.#selectedEventId !== null) {
            const stillVisible = filtered.some((e) => e.id === this.#selectedEventId);

            if (!stillVisible) {
                this.#selectedEventId = null;
                this.#fillDetail(null);
                document.getElementById("btnEditEvent").disabled = true;
                document.getElementById("btnDeleteEvent").disabled = true;
            }
        }
    }

    #applyFilters(events) {
        const statusVal = document.getElementById("filterStatus").value;
        const tagVal = document.getElementById("filterTag").value;
        const partVal = document.getElementById("filterParticipant").value;
        const q = document.getElementById("searchEvents").value.trim().toLowerCase();

        return events.filter((ev) => {
            if (statusVal !== "all" && ev.status !== statusVal) return false;

            if (tagVal !== "all") {
                const tagId = Number(tagVal);
                if (!(ev.tagIds ?? []).includes(tagId)) return false;
            }

            if (partVal !== "all") {
                const pId = Number(partVal);
                if (!(ev.participantIds ?? []).includes(pId)) return false;
            }

            if (q) {
                const hay = `${ev.title} ${ev.location} ${ev.description}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }

            return true;
        });
    }

    #fillDetail(ev) {
        const titleEl = document.getElementById("eventTitle");
        const subtitleEl = document.getElementById("eventSubtitle");
        const dtEl = document.getElementById("eventDateTime");
        const locEl = document.getElementById("eventLocation");
        const stEl = document.getElementById("eventStatus");
        const descEl = document.getElementById("eventDescription");

        const tagsWrap = document.getElementById("eventTags");
        const partsWrap = document.getElementById("eventParticipants");
        const invitesWrap = document.getElementById("eventInvites"); // WICHTIG: im HTML anlegen

        if (!ev) {
            titleEl.textContent = "Bitte Event auswählen";
            subtitleEl.textContent = "—";
            dtEl.textContent = "—";
            locEl.textContent = "—";
            stEl.textContent = "—";
            descEl.textContent = "—";
            tagsWrap.replaceChildren();
            partsWrap.replaceChildren();
            if (invitesWrap) invitesWrap.replaceChildren();
            return;
        }

        titleEl.textContent = ev.title;
        subtitleEl.textContent = `${this.#formatDateTime(ev.datetime)} · ${ev.location}`;
        dtEl.textContent = this.#formatDateTime(ev.datetime);
        locEl.textContent = ev.location;
        stEl.textContent = ev.status === "planned" ? "geplant" : "abgeschlossen";
        descEl.textContent = ev.description;

        // Tags als Chips
        tagsWrap.replaceChildren();
        for (const id of ev.tagIds ?? []) {
            const tag = this.#tags.find((t) => t.id === id);
            if (!tag) continue;
            const chip = document.createElement("span");
            chip.className = "chip";
            chip.textContent = tag.name;
            tagsWrap.appendChild(chip);
        }

        // Teilnehmer + Status (ohne Dropdowns)
        partsWrap.replaceChildren();

        const inv = ev.invitations ?? {};
        for (const id of ev.participantIds ?? []) {
            const p = this.#participants.find((x) => x.id === id);
            if (!p) continue;

            const status = inv[String(id)]?.status ?? "pending";
            const statusLabel =
                status === "accepted" ? "zugesagt" : status === "declined" ? "abgesagt" : "unentschieden";

            const li = document.createElement("li");
            li.style.display = "flex";
            li.style.justifyContent = "space-between";
            li.style.alignItems = "center";
            li.style.gap = "12px";

            const left = document.createElement("span");
            left.textContent = `${p.name} (${p.email})${p.avatar ? " · " + p.avatar : ""}`;

            const badge = document.createElement("span");
            badge.textContent = statusLabel;
            badge.style.fontSize = "12px";
            badge.style.padding = "4px 8px";
            badge.style.borderRadius = "999px";
            badge.style.border = "1px solid var(--border)";
            badge.style.opacity = "0.85";

            li.appendChild(left);
            li.appendChild(badge);
            partsWrap.appendChild(li);
        }

        // Organizer-Übersicht: wer zugesagt hat (kleine Zusammenfassung)
        // (optional, wenn du willst)
        // -> könnte man in invitesWrap als kleines Summary anzeigen

        // Demo-Emails anzeigen (wenn Container existiert)
        if (invitesWrap) {
            invitesWrap.replaceChildren();

            const title = document.createElement("h5");
            title.textContent = "";
            invitesWrap.appendChild(title);

            const mails = Object.entries(ev.invitations ?? {});
            if (mails.length === 0) {
                const p = document.createElement("p");
                p.style.opacity = ".7";
                p.textContent = "Noch keine Einladungen verschickt (füge Teilnehmer zu, dann werden Mails erzeugt).";
                invitesWrap.appendChild(p);
            } else {
                for (const [pid, payload] of mails) {
                    const p = this.#participants.find((x) => x.id === Number(pid));
                    const toLine = p ? `${p.name} <${p.email}>` : `TeilnehmerIn ${pid}`;

                    const box = document.createElement("div");
                    box.style.border = "1px solid var(--border)";
                    box.style.borderRadius = "12px";
                    box.style.padding = "10px";
                    box.style.margin = "10px 0";
                    box.style.background = "var(--bg-elev)";

                    const head = document.createElement("div");
                    head.style.fontSize = "13px";
                    head.style.opacity = ".85";
                    head.innerHTML = `<div><b>An:</b> ${this.#esc(toLine)}</div>
                            <div><b>Betreff:</b> Einladung: ${this.#esc(ev.title)}</div>`;

                    const body = document.createElement("pre");
                    body.style.whiteSpace = "pre-wrap";
                    body.style.margin = "10px 0 0";
                    body.style.fontFamily = "inherit";
                    body.style.fontSize = "13px";
                    body.textContent = payload.mail ?? "(keine Mail)";

                    box.appendChild(head);
                    box.appendChild(body);
                    invitesWrap.appendChild(box);
                }
            }
        }
    }

    // =========================
    // INVITE / STATUS HELPERS
    // =========================
    #randomInviteStatus() {
        // Damit du "random zugesagt/abgesagt/unentschieden" bekommst
        const r = Math.random();
        if (r < 0.34) return "accepted";
        if (r < 0.67) return "declined";
        return "pending";
    }

    #buildInviteMail(participant, evData) {
        const when = this.#formatDateTime(evData.datetime);
        const org = this.#currentUser ? `${this.#currentUser.name} <${this.#currentUser.email}>` : "Organizer";

        return (
            `Hallo ${participant.name},\n\n` +
            `du wurdest zu folgendem Event eingeladen:\n\n` +
            `Event: ${evData.title}\n` +
            `Datum & Uhrzeit: ${when}\n` +
            `Ort: ${evData.location}\n` +
            (evData.description ? `Beschreibung: ${evData.description}\n` : "") +
            `\nBitte gib Bescheid, ob du teilnehmen kannst.\n\n` +
            `Liebe Grüße\n${org}\n`
        );
    }

    #diffAdded(oldIds, newIds) {
        const oldSet = new Set(oldIds.map(Number));
        return newIds.filter((id) => !oldSet.has(Number(id)));
    }

    #diffRemoved(oldIds, newIds) {
        const newSet = new Set(newIds.map(Number));
        return oldIds.filter((id) => !newSet.has(Number(id)));
    }

    // =========================
    // HELPERS
    // =========================
    #formatDateTime(iso) {
        const d = new Date(iso);
        return d.toLocaleString("de-AT", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    #toDatetimeLocal(iso) {
        const d = new Date(iso);
        const pad = (n) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
            d.getMinutes()
        )}`;
    }

    #esc(str) {
        return String(str ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    // helper to clone event into plain object
    #eventToPlain(ev) {
        return {
            id: ev.id,
            title: ev.title,
            datetime: ev.datetime,
            location: ev.location,
            description: ev.description,
            status: ev.status,
            tagIds: ev.tagIds ?? [],
            participantIds: ev.participantIds ?? [],
        };
    }

    // =========================
    // DUMMY DATA
    // =========================
    #seedDummyData() {
        this.#tags = [
            new Tag({ id: 1, name: "Verein" }),
            new Tag({ id: 2, name: "Workshop" }),
            new Tag({ id: 3, name: "Party" }),
            new Tag({ id: 4, name: "Konzert" }),
        ];

        this.#participants = [
            new Participant({ id: 1, name: "Max Mustermann", email: "max@example.com", avatar: "MM" }),
            new Participant({ id: 2, name: "Anna Beispiel", email: "anna@example.com", avatar: "AB" }),
            new Participant({ id: 3, name: "Lena Berger", email: "lena@example.com", avatar: "LB" }),
        ];

        // Beispiel-Event mit Einladungen
        const e1 = new EventItem({
            id: 101,
            title: "Vereinsabend Februar",
            datetime: "2026-02-22T19:00:00",
            location: "Vereinshaus",
            description: "Monatliches Treffen inkl. Planung für Frühjahr.",
            status: "planned",
            tagIds: [1],
            participantIds: [1, 2],
        });
        e1.invitations = {
            "1": { status: "accepted", mail: this.#buildInviteMail(this.#participants[0], e1), sentAt: new Date().toISOString() },
            "2": { status: "pending", mail: this.#buildInviteMail(this.#participants[1], e1), sentAt: new Date().toISOString() },
        };

        const e2 = new EventItem({
            id: 102,
            title: "Figma Workshop",
            datetime: "2026-03-01T14:00:00",
            location: "FH Hagenberg",
            description: "UI Komponenten & Prototyping – Hands-on.",
            status: "planned",
            tagIds: [2],
            participantIds: [2, 3],
        });
        e2.invitations = {
            "2": { status: "declined", mail: this.#buildInviteMail(this.#participants[1], e2), sentAt: new Date().toISOString() },
            "3": { status: "accepted", mail: this.#buildInviteMail(this.#participants[2], e2), sentAt: new Date().toISOString() },
        };

        const e3 = new EventItem({
            id: 103,
            title: "After-Exam Party",
            datetime: "2026-01-20T22:00:00",
            location: "Linz",
            description: "Feiern nach der Prüfung 🎉",
            status: "done",
            tagIds: [3],
            participantIds: [1, 2, 3],
        });
        e3.invitations = {
            "1": { status: "pending", mail: this.#buildInviteMail(this.#participants[0], e3), sentAt: new Date().toISOString() },
            "2": { status: "accepted", mail: this.#buildInviteMail(this.#participants[1], e3), sentAt: new Date().toISOString() },
            "3": { status: "declined", mail: this.#buildInviteMail(this.#participants[2], e3), sentAt: new Date().toISOString() },
        };

        this.#events = [e1, e2, e3];
    }
}
