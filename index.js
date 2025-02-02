import { fetchJSON, renderProjects } from "./global.js";

document.addEventListener("DOMContentLoaded", async () => {
    const projectsContainer = document.querySelector(".projects");
    if (projectsContainer) {
        const projects = await fetchJSON("lib/projects.json");
        const latestProjects = projects.slice(0, 3); // Get the first 3 projects
        console.log(latestProjects);
        renderProjects(latestProjects, projectsContainer, "h3");
    }
});
