export default class EventItem {
    #id;
    #title;
    #datetime;      // ISO string
    #location;
    #description;
    #status;        // "planned" | "done"
    #tagIds;        // number[]
    #participantIds;// number[]

    constructor({ id, title, datetime, location, description, status, tagIds = [], participantIds = [] }) {
        this.#id = id;
        this.#title = title;
        this.#datetime = datetime;
        this.#location = location;
        this.#description = description;
        this.#status = status;
        this.#tagIds = [...tagIds];
        this.#participantIds = [...participantIds];
    }

    get id() { return this.#id; }
    get title() { return this.#title; }
    get datetime() { return this.#datetime; }
    get location() { return this.#location; }
    get description() { return this.#description; }
    get status() { return this.#status; }
    get tagIds() { return [...this.#tagIds]; }
    get participantIds() { return [...this.#participantIds]; }
}
