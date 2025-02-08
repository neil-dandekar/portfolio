import { fetchJSON, renderProjects } from "../global.js";
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";

document.addEventListener("DOMContentLoaded", async () => {
    const projectsContainer = document.querySelector(".projects");
    const projectsTitle = document.querySelector(".projects-title");

    // Fetch and render projects
    let projects = await fetchJSON("lib/projects.json");
    renderProjects(projects, projectsContainer, "h2");

    if (projectsTitle) {
        projectsTitle.textContent = `Projects (${projects.length})`;
    }

    let query = "";
    let selectedIndex = -1;
    let newData = [];

    function applyFilters() {
        if (!newData.length) return; // Ensure newData is initialized before use
        let filteredProjects = projects.filter((project) => {
            let matchesSearch =
                project.title.toLowerCase().includes(query.toLowerCase()) ||
                project.description.toLowerCase().includes(query.toLowerCase());
            let matchesYear =
                selectedIndex === -1 ||
                project.year === newData[selectedIndex].label;
            return matchesSearch && matchesYear;
        });
        renderProjects(filteredProjects, projectsContainer, "h2");
    }

    function renderPieChart() {
        let newRolledData = d3.rollups(
            projects,
            (v) => v.length,
            (d) => d.year
        );

        newData = newRolledData.map(([year, count]) => {
            return { value: count, label: year };
        });

        let newSliceGenerator = d3.pie().value((d) => d.value);
        let newArcData = newSliceGenerator(newData);
        let newArcGenerator = d3.arc().innerRadius(0).outerRadius(50);
        let newArcs = newArcData.map((d) => newArcGenerator(d));
        let colors = d3.scaleOrdinal(d3.schemeTableau10);

        let svg = d3.select("svg");
        svg.selectAll("path").remove();
        newArcs.forEach((arc, idx) => {
            svg.append("path")
                .attr("d", arc)
                .attr("fill", colors(idx))
                .attr("class", idx === selectedIndex ? "selected" : "")
                .on("click", () => {
                    selectedIndex = selectedIndex === idx ? -1 : idx;
                    svg.selectAll("path").attr("class", (_, i) =>
                        i === selectedIndex ? "selected" : ""
                    );
                    applyFilters();
                });
        });

        let legend = d3.select(".legend");
        legend.selectAll("*").remove();

        newData.forEach((d, idx) => {
            legend
                .append("li")
                .attr("style", `--color: ${colors(idx)}`)
                .attr(
                    "class",
                    idx === selectedIndex
                        ? "selected legend-item"
                        : "legend-item"
                )
                .html(
                    `<span class="swatch"></span> ${d.label} <em>(${d.value})</em>`
                )
                .on("click", () => {
                    selectedIndex = selectedIndex === idx ? -1 : idx;
                    legend
                        .selectAll("li")
                        .attr("class", (_, i) =>
                            i === selectedIndex
                                ? "selected legend-item"
                                : "legend-item"
                        );
                    applyFilters();
                });
        });
    }

    let searchInput = document.querySelector(".searchBar");
    searchInput.addEventListener("input", (event) => {
        query = event.target.value;
        applyFilters();
    });

    renderPieChart();
});
