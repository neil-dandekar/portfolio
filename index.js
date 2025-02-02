import { fetchJSON, renderProjects } from "./global.js";

try {
    import("./global.js")
        .then((module) => {
            console.log("global.js found and imported successfully:", module);
        })
        .catch((error) => {
            console.error("Error importing global.js:", error);
        });
} catch (error) {
    console.error("Failed to import global.js:", error);
}

document.addEventListener("DOMContentLoaded", async () => {
    const projectsContainer = document.querySelector(".projects");
    if (projectsContainer) {
        const projects = await fetchJSON("lib/projects.json");
        const latestProjects = projects.slice(0, 3); // Get the first 3 projects
        console.log(latestProjects);
        renderProjects(latestProjects, projectsContainer, "h3");
    }
});
