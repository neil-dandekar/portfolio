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

export async function fetchJSON(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch data: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error("Error fetching JSON data:", error);
        return [];
    }
}

export function renderProjects(
    projects,
    containerElement,
    headingLevel = "h2"
) {
    if (!containerElement) {
        console.error("Invalid container element provided");
        return;
    }

    containerElement.innerHTML = ""; // Clear existing content

    projects.forEach((project) => {
        const article = document.createElement("article");
        article.innerHTML = `
            <${headingLevel}>${project.title}</${headingLevel}>
            <img src="${project.image}" alt="${project.title}">
            <p>${project.description}</p>
        `;
        containerElement.appendChild(article);
    });

    // Display count of projects
    const projectsTitle = document.querySelector(".projects-title");
    if (projectsTitle) {
        projectsTitle.textContent = `Projects (${projects.length})`;
    }
}

export async function fetchGitHubData(username) {
    try {
        const response = await fetch(
            `https://api.github.com/users/${username}`
        );
        if (!response.ok) {
            throw new Error(
                `Failed to fetch GitHub data: ${response.statusText}`
            );
        }
        return await response.json();
    } catch (error) {
        console.error("Error fetching GitHub data:", error);
        return null;
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    const profileStats = document.querySelector("#profile-stats");
    if (profileStats) {
        const githubData = await fetchGitHubData("neil-dandekar"); // Replace with actual username
        if (githubData) {
            profileStats.innerHTML = `
                <h3>GitHub Profile Stats</h3>
                <dl>
                    <dt>Public Repos: ${githubData.public_repos}</dt>
                    <dt>Public Gists: ${githubData.public_gists}</dt>
                    <dt>Followers: ${githubData.followers}</dt>
                    <dt>Following: ${githubData.following}</dt>
                </dl>
            `;
        }
    }
});
