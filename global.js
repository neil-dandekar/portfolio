console.log("IT'S ALIVE!");

function $$(selector, context = document) {
    return Array.from(context.querySelectorAll(selector));
}

// Dynamically set base URL

// Set base URL dynamically based on hostname
const LOCAL =
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "localhost";

const BASE_URL = LOCAL ? "" : "/portfolio/";

const baseElement = document.querySelector("base");
console.log("Base URL:", baseElement.href);

// Navigation menu automation
let pages = [
    { url: "", title: "Home" },
    { url: "https://github.com/neil-dandekar", title: "GitHub" },
    { url: "projects/", title: "Projects" },
    { url: "resume/", title: "Resume" },
    { url: "contact/", title: "Contact" },
];

const nav = document.createElement("nav");

const ARE_WE_HOME = document.documentElement.classList.contains("home");

for (let p of pages) {
    // let url = !ARE_WE_HOME && !p.url.startsWith("http") ? p.url : p.url;
    const GITHUB = p.title == "GitHub";
    let url = GITHUB ? p.url : BASE_URL + p.url;
    let a = document.createElement("a");
    a.href = url;
    a.textContent = p.title;
    if (a.host === location.host && a.pathname === location.pathname) {
        a.classList.add("current");
    }
    // Add special behavior for external links
    if (a.host !== location.host) {
        a.target = "_blank";
        a.rel = "noopener noreferrer";
    }
    nav.append(a);
}

// Insert the nav after the <h1> element
const heading = document.querySelector("h1");
if (heading) {
    heading.insertAdjacentElement("afterend", nav);
}

// Dark mode switch
document.body.insertAdjacentHTML(
    "afterbegin",
    `<label class="color-scheme">
    Theme:
    <select>
      <option value="light dark">Automatic</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
  </label>`
);

const select = document.querySelector(".color-scheme select");
select.addEventListener("input", (event) => {
    document.documentElement.style.setProperty(
        "color-scheme",
        event.target.value
    );
    localStorage.colorScheme = event.target.value;
});

if ("colorScheme" in localStorage) {
    document.documentElement.style.setProperty(
        "color-scheme",
        localStorage.colorScheme
    );
    select.value = localStorage.colorScheme;
}

// Apply styles to position the toggle at the top-right corner
const colorSchemeLabel = document.querySelector(".color-scheme");
if (colorSchemeLabel) {
    colorSchemeLabel.style.position = "absolute";
    colorSchemeLabel.style.top = "1rem";
    colorSchemeLabel.style.right = "1rem";
    colorSchemeLabel.style.fontSize = "80%";
    colorSchemeLabel.style.fontFamily = "inherit"; // Ensure consistency with page fonts
}
