/*******************************************************
 * main.js
 * Both scrollys show all commits (no slicing).
 *******************************************************/

// Global variables
let data = [];
let commits = [];
let selectedCommits = [];

const width = 1000;
const height = 600;
let xScale, yScale;
let timeScale;

// For pinned scrolly logic:
const ITEM_HEIGHT = 100; // approximate height per commit item
const FILE_ITEM_HEIGHT = 100; // same for the file scrolly

////////////////////////////////////////////////////
// 1) LOAD & PROCESS DATA
////////////////////////////////////////////////////

async function loadData() {
    data = await d3.csv("meta/loc.csv", (row) => ({
        ...row,
        line: +row.line,
        depth: +row.depth,
        length: +row.length,
        date: new Date(row.date + "T00:00" + row.timezone),
        datetime: new Date(row.datetime),
    }));
    processCommits();
    displayData(); // fill the #stats section
}

function processCommits() {
    // Group CSV rows by commit hash
    commits = d3
        .groups(data, (d) => d.commit)
        .map(([commit, lines]) => {
            const { author, date, time, timezone, datetime } = lines[0];
            const commitObj = {
                id: commit,
                url: "https://github.com/vis-society/lab-7/commit/" + commit,
                author,
                date,
                time,
                timezone,
                datetime,
                hourFrac: datetime.getHours() + datetime.getMinutes() / 60,
                totalLines: lines.length,
            };
            // Put the line array in a non-enumerable property
            Object.defineProperty(commitObj, "lines", {
                value: lines,
                configurable: true,
                writable: false,
                enumerable: false,
            });
            return commitObj;
        });

    // Sort commits chronologically
    commits.sort((a, b) => a.datetime - b.datetime);
}

function displayData() {
    d3.select("#stats").selectAll("*").remove();
    const dl = d3.select("#stats").append("dl").attr("class", "stats");

    // Total lines of code across all commits
    const totalLOC = commits.reduce(
        (sum, commit) => sum + commit.totalLines,
        0
    );
    dl.append("dt").text("Total Lines of Code");
    dl.append("dd").text(totalLOC);

    // Total commits
    dl.append("dt").text("Total Commits");
    dl.append("dd").text(commits.length);

    // Total files
    const allFiles = commits.flatMap((commit) =>
        commit.lines.map((line) => line.file)
    );
    const totalFiles = new Set(allFiles).size;
    dl.append("dt").text("Total Number of Files");
    dl.append("dd").text(totalFiles);

    // Time of day with the most commits
    const workByPeriod = d3.rollups(
        commits,
        (v) => v.length,
        (d) => new Date(d.datetime).toLocaleString("en", { dayPeriod: "short" })
    );
    const maxPeriod = d3.greatest(workByPeriod, (d) => d[1])?.[0];
    dl.append("dt").text("Time of Day");
    dl.append("dd").text(maxPeriod);

    // Number of distinct days
    const totalDays = d3.group(commits, (d) =>
        new Date(d.datetime).toDateString()
    ).size;
    dl.append("dt").text("Number of Days Worked");
    dl.append("dd").text(totalDays);
}

////////////////////////////////////////////////////
// 2) MAIN SCATTERPLOT & TOOLTIP
////////////////////////////////////////////////////

function updateScatterPlot(visibleCommits) {
    // Remove old chart
    d3.select("svg").remove();

    // Create new SVG
    const svg = d3
        .select("#chart")
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .style("overflow", "visible");

    // X scale (time)
    xScale = d3
        .scaleTime()
        .domain(d3.extent(visibleCommits, (d) => d.datetime))
        .range([0, width])
        .nice();

    // Y scale (hourFrac -> 24)
    yScale = d3.scaleLinear().domain([0, 24]).range([height, 0]);

    // Margins
    const margin = { top: 10, right: 10, bottom: 30, left: 20 };
    const usableArea = {
        top: margin.top,
        right: width - margin.right,
        bottom: height - margin.bottom,
        left: margin.left,
        width: width - margin.left - margin.right,
        height: height - margin.top - margin.bottom,
    };

    // Reset domain ranges
    xScale.range([usableArea.left, usableArea.right]);
    yScale.range([usableArea.bottom, usableArea.top]);

    // Gridlines
    svg.append("g")
        .attr("class", "gridlines")
        .attr("transform", `translate(${usableArea.left}, 0)`)
        .call(d3.axisLeft(yScale).tickFormat("").tickSize(-usableArea.width));

    // Axes
    const xAxis = d3.axisBottom(xScale);
    const yAxis = d3
        .axisLeft(yScale)
        .tickFormat((d) => String(d % 24).padStart(2, "0") + ":00");

    svg.append("g")
        .attr("transform", `translate(0, ${usableArea.bottom})`)
        .call(xAxis);
    svg.append("g")
        .attr("transform", `translate(${usableArea.left}, 0)`)
        .call(yAxis);

    // Circles
    const dots = svg.append("g").attr("class", "dots");
    const [minLines, maxLines] = d3.extent(visibleCommits, (d) => d.totalLines);
    const rScale = d3
        .scaleLog()
        .domain([Math.max(1, minLines), maxLines])
        .range([3, 16]);

    dots.selectAll("circle")
        .data(visibleCommits)
        .join("circle")
        .attr("cx", (d) => xScale(d.datetime))
        .attr("cy", (d) => yScale(d.hourFrac))
        .attr("r", 0)
        .style("fill-opacity", 0.7)
        .on("mouseenter", (event, commit) => {
            d3.select(event.currentTarget).classed(
                "selected",
                isCommitSelected(commit)
            );
            updateTooltipContent(commit);
            updateTooltipVisibility(true);
            updateTooltipPosition(event);
        })
        .on("mousemove", (event) => updateTooltipPosition(event))
        .on("mouseleave", (event, commit) => {
            d3.select(event.currentTarget).classed(
                "selected",
                isCommitSelected(commit)
            );
            updateTooltipContent({});
            updateTooltipVisibility(false);
        })
        .transition()
        .duration(500)
        .attr("r", (d) => rScale(d.totalLines));

    brushSelector(svg);
}

// Optional brush
function brushSelector(svg) {
    svg.append("g")
        .attr("class", "brush")
        .call(d3.brush().on("start brush end", brushed));
    svg.selectAll(".dots, .overlay ~ *").raise();
}

function brushed(evt) {
    const brushSelection = evt.selection;
    selectedCommits = !brushSelection
        ? []
        : commits.filter((commit) => {
              const [x0, y0] = brushSelection[0];
              const [x1, y1] = brushSelection[1];
              const x = xScale(commit.datetime);
              const y = yScale(commit.hourFrac);
              return x >= x0 && x <= x1 && y >= y0 && y <= y1;
          });
    updateSelection();
    updateSelectionCount();
    updateLanguageBreakdown();
}

function isCommitSelected(commit) {
    return selectedCommits.includes(commit);
}

function updateSelection() {
    d3.selectAll("circle").classed("selected", (d) => isCommitSelected(d));
}

function updateSelectionCount() {
    const countElement = document.getElementById("selection-count");
    countElement.textContent = `${
        selectedCommits.length || "No"
    } commits selected`;
}

function updateLanguageBreakdown() {
    const container = document.getElementById("language-breakdown");
    if (selectedCommits.length === 0) {
        container.innerHTML = "";
        return;
    }
    const lines = selectedCommits.flatMap((d) => d.lines);
    const breakdown = d3.rollup(
        lines,
        (v) => v.length,
        (d) => d.type
    );
    container.innerHTML = "";
    for (const [language, count] of breakdown) {
        const proportion = count / lines.length;
        const formatted = d3.format(".1~%")(proportion);
        container.innerHTML += `
      <dt>${language}</dt>
      <dd>${count} lines (${formatted})</dd>
    `;
    }
}

////////////////////////////////////////////////////
// 3) TOOLTIP
////////////////////////////////////////////////////

function updateTooltipContent(commit) {
    const link = document.getElementById("commit-link");
    const dateEl = document.getElementById("commit-date");
    const timeEl = document.getElementById("commit-time");
    const authorEl = document.getElementById("commit-author");
    const linesEditedEl = document.getElementById("commit-lines-edited");
    if (!link || !dateEl || !timeEl || !authorEl || !linesEditedEl) {
        console.error("Tooltip elements not found");
        return;
    }
    if (!commit.id) return;

    link.href = commit.url;
    link.textContent = commit.id;
    dateEl.textContent = commit.datetime?.toLocaleString("en", {
        dateStyle: "full",
    });
    timeEl.textContent = commit.datetime?.toLocaleString("en", {
        timeStyle: "short",
    });
    authorEl.textContent = commit.author;
    linesEditedEl.textContent = commit.totalLines;
}

function updateTooltipVisibility(isVisible) {
    const tooltip = document.getElementById("commit-tooltip");
    tooltip.style.display = isVisible ? "block" : "none";
}

function updateTooltipPosition(event) {
    const tooltip = document.getElementById("commit-tooltip");
    const tooltipHeight = tooltip.offsetHeight;
    const offset = 10;
    tooltip.style.left = `${event.clientX}px`;
    tooltip.style.top = `${event.clientY - tooltipHeight - offset}px`;
}

////////////////////////////////////////////////////
// 4) FILE LIST (STATIC OVERVIEW)
////////////////////////////////////////////////////

function displayCommitFiles() {
    // If you want an overall static display of all lines + files, do it here
    const lines = commits.flatMap((d) => d.lines);
    const fileTypeColors = d3.scaleOrdinal(d3.schemeTableau10);

    let files = d3
        .groups(lines, (d) => d.file)
        .map(([name, lines]) => ({
            name,
            lines,
        }));
    files.sort((a, b) => a.name.localeCompare(b.name));

    d3.select("#file-visualization .files").selectAll("div").remove();
    const filesContainer = d3
        .select("#file-visualization .files")
        .selectAll("div")
        .data(files)
        .enter()
        .append("div");

    filesContainer
        .append("dt")
        .html(
            (d) =>
                `<code>${d.name}</code><small>${d.lines.length} lines</small>`
        );
    filesContainer
        .append("dd")
        .selectAll("div")
        .data((d) => d.lines)
        .enter()
        .append("div")
        .attr("class", "line")
        .style("background", (d) => fileTypeColors(d.type));
}

////////////////////////////////////////////////////
// 5) SECOND SCROLLY: FILE SIZES PER COMMIT
////////////////////////////////////////////////////

/**
 * We’ll display all commits in the right scrolly (#file-items-container).
 * Each commit text will say how many lines/files existed up to that commit’s time.
 * The left column (#file-visualization) is pinned and updates whenever the user
 * scrolls to a new “active” commit.
 */

// Helper to get all lines up to a certain Date
function getFileDataFiltered(timeThreshold) {
    const filtered = commits.filter((d) => d.datetime <= timeThreshold);
    const lines = filtered.flatMap((d) => d.lines);
    let files = d3
        .groups(lines, (d) => d.file)
        .map(([name, lines]) => ({
            name,
            lines,
        }));
    files.sort((a, b) => a.name.localeCompare(b.name));
    return files;
}

// Re-render the pinned left column based on the "active" commit's datetime
function updateFileVisualization(fileDataSlice) {
    const fileTypeColors = d3.scaleOrdinal(d3.schemeTableau10);

    d3.select("#file-visualization .files").selectAll("div").remove();
    const filesContainer = d3
        .select("#file-visualization .files")
        .selectAll("div")
        .data(fileDataSlice)
        .enter()
        .append("div");

    filesContainer
        .append("dt")
        .html(
            (d) =>
                `<code>${d.name}</code><small>${d.lines.length} lines</small>`
        );
    filesContainer
        .append("dd")
        .selectAll("div")
        .data((d) => d.lines)
        .enter()
        .append("div")
        .attr("class", "line")
        .style("background", (d) => fileTypeColors(d.type));
}

// Create one text item per commit in #file-items-container
function renderAllFileCommits() {
    const container = d3.select("#file-items-container");
    container.selectAll("div.file-commit-item").remove();

    container
        .selectAll("div.file-commit-item")
        .data(commits)
        .enter()
        .append("div")
        .attr("class", "file-commit-item")
        .style("margin", "1em 0")
        .html((d) => {
            // Compute lines + files up to this commit's datetime
            const filteredLines = commits
                .filter((c) => c.datetime <= d.datetime)
                .flatMap((c) => c.lines);
            const totalLines = filteredLines.length;
            const totalFiles = new Set(filteredLines.map((x) => x.file)).size;

            return `
        <p>
          At ${d.datetime.toLocaleString("en", {
              dateStyle: "full",
              timeStyle: "short",
          })},
          the repository had a total of ${totalLines} lines
          across ${totalFiles} files.
        </p>
      `;
        });
}

////////////////////////////////////////////////////
// 6) DOMContentLoaded (set everything up)
////////////////////////////////////////////////////

document.addEventListener("DOMContentLoaded", async () => {
    // --- Load data ---
    await loadData();

    // --- Display overall stats (#stats) and scatterplot with all commits ---
    displayData();
    updateScatterPlot(commits);

    // --- Optionally show an overall static “file list” (unrelated to scrolly) ---
    displayCommitFiles();

    // A time scale if you need it
    timeScale = d3
        .scaleTime()
        .domain([
            d3.min(commits, (d) => d.datetime),
            d3.max(commits, (d) => d.datetime),
        ])
        .range([0, 100]);

    /*************************************************
     * FIRST SCROLLY (Commits)
     * #scroll-container pinned chart (#chart)
     * #items-container scrolly text
     *************************************************/
    const scrollContainer = d3.select("#scroll-container");
    const itemsContainer = d3.select("#items-container");
    const spacer = d3.select("#spacer");

    // Make enough spacer so we can scroll through all commits
    spacer.style("height", `${commits.length * ITEM_HEIGHT}px`);

    // Render one scrolly text item per commit
    itemsContainer.selectAll("div.commit-item").remove();
    itemsContainer
        .selectAll("div.commit-item")
        .data(commits)
        .enter()
        .append("div")
        .attr("class", "commit-item")
        .style("margin", "1em 0")
        .html((d, i) => {
            const numFiles = d3.rollups(
                d.lines,
                (v) => v.length,
                (line) => line.file
            ).length;
            return `
        <p>
          On ${d.datetime.toLocaleString("en", {
              dateStyle: "full",
              timeStyle: "short",
          })},
          I made <a href="${d.url}" target="_blank">${
                i === 0
                    ? "my first commit, and it was glorious"
                    : "another glorious commit"
            }</a>.
          I edited ${d.totalLines} lines across ${numFiles} files.
          Then I looked over all I had made, and I saw that it was very good.
        </p>
      `;
        });

    // Update chart based on which item is near the top
    scrollContainer.on("scroll", () => {
        const scrollTop = Math.max(0, scrollContainer.property("scrollTop"));
        let currentIndex = Math.floor(scrollTop / ITEM_HEIGHT);
        currentIndex = Math.min(currentIndex, commits.length - 1);

        // Show all commits up to the active one in the chart
        const visibleSlice = commits.slice(0, currentIndex + 1);
        updateScatterPlot(visibleSlice);

        // Update date label
        const currentCommit = commits[currentIndex];
        d3.select("#scroll-date").text(
            currentCommit.datetime.toLocaleString("en", {
                dateStyle: "long",
                timeStyle: "short",
            })
        );
    });

    /*************************************************
     * SECOND SCROLLY (File Sizes)
     * #file-scroll-container pinned left column (#file-visualization)
     * #file-items-container scrolly text
     *************************************************/
    const file_scrollContainer = d3.select("#file-scroll-container");
    const file_itemsContainer = d3.select("#file-items-container");
    const file_spacer = d3.select("#file-spacer");

    // Enough space to scroll through all commits
    file_spacer.style("height", `${commits.length * FILE_ITEM_HEIGHT}px`);

    // Create a text block for every commit
    renderAllFileCommits();

    // On scroll, figure out the "active" commit and update pinned file list
    file_scrollContainer.on("scroll", () => {
        const scrollTop = Math.max(
            0,
            file_scrollContainer.property("scrollTop")
        );
        let currentIndex = Math.floor(scrollTop / FILE_ITEM_HEIGHT);
        currentIndex = Math.min(currentIndex, commits.length - 1);

        const thresholdTime = commits[currentIndex].datetime;
        const fileDataSlice = getFileDataFiltered(thresholdTime);
        updateFileVisualization(fileDataSlice);
    });

    // Initialize pinned file list for the first commit
    const fileDataSlice = getFileDataFiltered(commits[0].datetime);
    updateFileVisualization(fileDataSlice);
});
