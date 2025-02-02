import { fetchJSON, renderProjects } from "../global.js";

document.addEventListener("DOMContentLoaded", async () => {
    const projectsContainer = document.querySelector(".projects");
    if (projectsContainer) {
        const projects = await fetchJSON("lib/projects.json");
        renderProjects(projects, projectsContainer, "h2");
    }
});
