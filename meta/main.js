/*******************************************************
 * main.js
 * - First scrolly:
 *    -> One text block per commit
 *    -> A single full chart with circles for all commits
 *    -> As you scroll, we reveal circles and update a
 *       "live" summary (#stats) showing only the visible commits
 * - Second scrolly:
 *    -> Same approach for file sizes, but no summary changes needed
 *******************************************************/

// Global variables
let data = [];
let commits = [];
let selectedCommits = [];

const width = 1000;
const height = 600;
let xScale, yScale;

// Approximate item height for scrolly
const ITEM_HEIGHT = 100;

/**
 * 1) LOAD & PROCESS DATA
 */
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
}

function processCommits() {
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
            // Store line details in a non-enumerable property
            Object.defineProperty(commitObj, "lines", {
                value: lines,
                configurable: true,
                writable: false,
                enumerable: false,
            });
            return commitObj;
        });

    // Sort chronologically
    commits.sort((a, b) => a.datetime - b.datetime);
}

/**
 * 2) A HELPER TO UPDATE THE SUMMARY (#stats)
 *    given a subset of commits.
 */
function updateSummaryStats(visibleCommits) {
    // Clear whatever was in #stats
    d3.select("#stats").selectAll("*").remove();

    const dl = d3.select("#stats").append("dl").attr("class", "stats");

    // Summarize the subset
    const totalLOC = visibleCommits.reduce(
        (sum, commit) => sum + commit.totalLines,
        0
    );
    dl.append("dt").text("Total Lines of Code");
    dl.append("dd").text(totalLOC);

    dl.append("dt").text("Total Commits");
    dl.append("dd").text(visibleCommits.length);

    // Files in the subset
    const allFiles = visibleCommits.flatMap((commit) =>
        commit.lines.map((line) => line.file)
    );
    const totalFiles = new Set(allFiles).size;
    dl.append("dt").text("Total Number of Files");
    dl.append("dd").text(totalFiles);

    // Time of day with the most commits (just among visibleCommits)
    const workByPeriod = d3.rollups(
        visibleCommits,
        (v) => v.length,
        (d) => d.datetime.toLocaleString("en", { dayPeriod: "short" })
    );
    if (workByPeriod.length > 0) {
        const maxPeriod = d3.greatest(workByPeriod, (d) => d[1])?.[0];
        dl.append("dt").text("Time of Day");
        dl.append("dd").text(maxPeriod);
    } else {
        dl.append("dt").text("Time of Day");
        dl.append("dd").text("N/A");
    }

    // Distinct days in the subset
    const totalDays = d3.group(visibleCommits, (d) =>
        d.datetime.toDateString()
    ).size;
    dl.append("dt").text("Number of Days Worked");
    dl.append("dd").text(totalDays);
}

/**
 * 3) DRAW THE SCATTERPLOT ONCE, SHOW ALL CIRCLES HIDDEN INITIALLY
 */
function drawFullScatterPlot() {
    d3.select("#chart").select("svg")?.remove();

    const svg = d3
        .select("#chart")
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .style("overflow", "visible");

    // Entire time range
    const [minDate, maxDate] = d3.extent(commits, (d) => d.datetime);
    xScale = d3.scaleTime().domain([minDate, maxDate]).range([0, width]).nice();
    yScale = d3.scaleLinear().domain([0, 24]).range([height, 0]);

    // Margins
    const margin = { top: 10, right: 10, bottom: 30, left: 20 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    // Adjust the scales
    xScale.range([margin.left, margin.left + chartWidth]);
    yScale.range([margin.top + chartHeight, margin.top]);

    // Gridlines
    svg.append("g")
        .attr("class", "gridlines")
        .attr("transform", `translate(${margin.left}, 0)`)
        .call(d3.axisLeft(yScale).tickFormat("").tickSize(-chartWidth));

    // Axes
    const xAxis = d3.axisBottom(xScale);
    const yAxis = d3
        .axisLeft(yScale)
        .tickFormat((d) => String(d % 24).padStart(2, "0") + ":00");

    svg.append("g")
        .attr("transform", `translate(0, ${margin.top + chartHeight})`)
        .call(xAxis);
    svg.append("g")
        .attr("transform", `translate(${margin.left}, 0)`)
        .call(yAxis);

    // Circles
    const dots = svg.append("g").attr("class", "dots");
    const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
    const rScale = d3
        .scaleLog()
        .domain([Math.max(1, minLines), maxLines])
        .range([3, 16]);

    dots.selectAll("circle")
        .data(commits)
        .join("circle")
        .attr("cx", (d) => xScale(d.datetime))
        .attr("cy", (d) => yScale(d.hourFrac))
        .attr("r", (d) => rScale(d.totalLines))
        .style("fill-opacity", 0) // start hidden
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
        });

    // Optional brush
    brushSelector(svg);
}

/**
 * 4) SCROLL HANDLER FOR FIRST SCROLLY
 *    -> We show circles for commits up to currentIndex
 *    -> And we also call updateSummaryStats(...) for that subset
 */
function updateVisibleCommits(currentIndex) {
    // Show circles up to currentIndex
    d3.selectAll(".dots circle").style("fill-opacity", (d, i) =>
        i <= currentIndex ? 0.7 : 0
    );
}

function brushSelector(svg) {
    svg.append("g")
        .attr("class", "brush")
        .call(d3.brush().on("start brush end", brushed));
    svg.selectAll(".dots, .overlay ~ *").raise();
}

function brushed(evt) {
    const selection = evt.selection;
    if (!selection) {
        selectedCommits = [];
    } else {
        const [x0, y0] = selection[0];
        const [x1, y1] = selection[1];
        selectedCommits = commits.filter((commit, i) => {
            const x = xScale(commit.datetime);
            const y = yScale(commit.hourFrac);
            return x >= x0 && x <= x1 && y >= y0 && y <= y1;
        });
    }
    updateSelection();
    updateSelectionCount();
    updateLanguageBreakdown();
}

function updateSelection() {
    d3.selectAll(".dots circle").classed("selected", (d) =>
        isCommitSelected(d)
    );
}

function isCommitSelected(commit) {
    return selectedCommits.includes(commit);
}

function updateSelectionCount() {
    const el = document.getElementById("selection-count");
    el.textContent = `${selectedCommits.length || "No"} commits selected`;
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

/**
 * 5) TOOLTIP
 */
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

/**
 * 6) FILE OVERVIEW / SECOND SCROLLY
 *    (unchanged, except we also add extra spacer space for the final commits)
 */

// A static file overview if needed
function displayCommitFiles() {
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

// Logic for second scrolly
function getFileDataFiltered(timeThreshold) {
    const filtered = commits.filter((c) => c.datetime <= timeThreshold);
    const lines = filtered.flatMap((c) => c.lines);
    let files = d3
        .groups(lines, (d) => d.file)
        .map(([name, lines]) => ({
            name,
            lines,
        }));
    files.sort((a, b) => a.name.localeCompare(b.name));
    return files;
}

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

/**
 * 7) DOMContentLoaded
 */
document.addEventListener("DOMContentLoaded", async () => {
    await loadData();

    // Draw the chart (all circles hidden initially)
    drawFullScatterPlot();

    // We'll do a final static "file overview" if desired
    displayCommitFiles();

    // -------------- FIRST SCROLLY (Commits) --------------
    const scrollContainer = d3.select("#scroll-container");
    const scrollContainerEl = document.getElementById("scroll-container");
    const containerHeight = scrollContainerEl.getBoundingClientRect().height;

    const itemsContainer = d3.select("#items-container");
    const spacer = d3.select("#spacer");

    // Extra spacer so last commit can become active
    const totalHeight = commits.length * ITEM_HEIGHT + containerHeight;
    spacer.style("height", `${totalHeight}px`);

    // Render text blocks, one per commit
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

    // On scroll, update chart and summary
    scrollContainer.on("scroll", () => {
        const scrollTop = Math.max(0, scrollContainer.property("scrollTop"));
        let currentIndex = Math.floor(scrollTop / ITEM_HEIGHT);
        currentIndex = Math.min(currentIndex, commits.length - 1);

        // Show circles up to currentIndex
        updateVisibleCommits(currentIndex);

        // Summaries for commits up to currentIndex
        const visibleSlice = commits.slice(0, currentIndex + 1);
        updateSummaryStats(visibleSlice);

        // Update the date label
        const currentCommit = commits[currentIndex];
        d3.select("#scroll-date").text(
            currentCommit.datetime.toLocaleString("en", {
                dateStyle: "long",
                timeStyle: "short",
            })
        );
    });

    // Initialize with first commit visible and summary
    updateVisibleCommits(0);
    updateSummaryStats(commits.slice(0, 1));

    // -------------- SECOND SCROLLY (File Sizes) --------------
    const file_scrollContainer = d3.select("#file-scroll-container");
    const fileScrollContainerEl = document.getElementById(
        "file-scroll-container"
    );
    const fileContainerHeight =
        fileScrollContainerEl.getBoundingClientRect().height;

    const file_itemsContainer = d3.select("#file-items-container");
    const file_spacer = d3.select("#file-spacer");

    // Again, add container height
    const fileTotalHeight = commits.length * ITEM_HEIGHT + fileContainerHeight;
    file_spacer.style("height", `${fileTotalHeight}px`);

    // Render text for all commits
    renderAllFileCommits();

    // On scroll, update pinned file list
    file_scrollContainer.on("scroll", () => {
        const scrollTop = Math.max(
            0,
            file_scrollContainer.property("scrollTop")
        );
        let currentIndex = Math.floor(scrollTop / ITEM_HEIGHT);
        currentIndex = Math.min(currentIndex, commits.length - 1);

        const thresholdTime = commits[currentIndex].datetime;
        const fileDataSlice = getFileDataFiltered(thresholdTime);
        updateFileVisualization(fileDataSlice);
    });

    // Initialize pinned file list for earliest commit
    const fileDataSlice = getFileDataFiltered(commits[0].datetime);
    updateFileVisualization(fileDataSlice);
});
