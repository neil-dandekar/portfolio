/*******************************************************
 * main.js
 * - First scrolly: shows all commits on the chart, reveals circles in real-time
 * - Second scrolly: same approach for file sizes (plus extra spacer height).
 *******************************************************/

// Global variables
let data = [];
let commits = [];
let selectedCommits = [];

const width = 1000;
const height = 600;
let xScale, yScale;

const ITEM_HEIGHT = 100; // approximate height of each commit text block

//------------------------------------------------------
// 1) LOAD & PROCESS DATA
//------------------------------------------------------

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
    displayData(); // Show summary stats
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
            // Store lines in a non-enumerable property
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

function displayData() {
    d3.select("#stats").selectAll("*").remove();
    const dl = d3.select("#stats").append("dl").attr("class", "stats");

    // Total lines of code
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
    const allFiles = commits.flatMap((c) => c.lines.map((line) => line.file));
    const totalFiles = new Set(allFiles).size;
    dl.append("dt").text("Total Number of Files");
    dl.append("dd").text(totalFiles);

    // Time of day with the most commits
    const workByPeriod = d3.rollups(
        commits,
        (v) => v.length,
        (d) => d.datetime.toLocaleString("en", { dayPeriod: "short" })
    );
    const maxPeriod = d3.greatest(workByPeriod, (d) => d[1])?.[0];
    dl.append("dt").text("Time of Day");
    dl.append("dd").text(maxPeriod);

    // Distinct days
    const totalDays = d3.group(commits, (d) => d.datetime.toDateString()).size;
    dl.append("dt").text("Number of Days Worked");
    dl.append("dd").text(totalDays);
}

//------------------------------------------------------
// 2) SCATTERPLOT: DRAW ONCE WITH FULL TIMELINE
//------------------------------------------------------

function drawFullScatterPlot() {
    // Remove any old SVG
    d3.select("#chart").select("svg")?.remove();

    // Create new SVG
    const svg = d3
        .select("#chart")
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .style("overflow", "visible");

    // Scales for the full date range
    const [minDate, maxDate] = d3.extent(commits, (d) => d.datetime);
    xScale = d3.scaleTime().domain([minDate, maxDate]).range([0, width]).nice();
    yScale = d3.scaleLinear().domain([0, 24]).range([height, 0]);

    // Margins
    const margin = { top: 10, right: 10, bottom: 30, left: 20 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    const usableLeft = margin.left;
    const usableTop = margin.top;

    // Adjust the scale ranges to the usable area
    xScale.range([usableLeft, usableLeft + chartWidth]);
    yScale.range([usableTop + chartHeight, usableTop]);

    // Gridlines
    svg.append("g")
        .attr("class", "gridlines")
        .attr("transform", `translate(${usableLeft}, 0)`)
        .call(d3.axisLeft(yScale).tickFormat("").tickSize(-chartWidth));

    // Axes
    const xAxis = d3.axisBottom(xScale);
    const yAxis = d3
        .axisLeft(yScale)
        .tickFormat((d) => String(d % 24).padStart(2, "0") + ":00");

    svg.append("g")
        .attr("transform", `translate(0, ${usableTop + chartHeight})`)
        .call(xAxis);
    svg.append("g")
        .attr("transform", `translate(${usableLeft}, 0)`)
        .call(yAxis);

    // One circle per commit
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
        // Start all hidden
        .style("fill-opacity", 0)
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

function brushSelector(svg) {
    svg.append("g")
        .attr("class", "brush")
        .call(d3.brush().on("start brush end", brushed));
    svg.selectAll(".dots, .overlay ~ *").raise();
}

function brushed(evt) {
    const brushSelection = evt.selection;
    if (!brushSelection) {
        selectedCommits = [];
    } else {
        const [x0, y0] = brushSelection[0];
        const [x1, y1] = brushSelection[1];
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

//------------------------------------------------------
// 3) SHOW/HIDE CIRCLES ON SCROLL
//------------------------------------------------------

function updateVisibleCommits(currentIndex) {
    // Show circles up to currentIndex, hide the rest
    d3.selectAll(".dots circle").style("fill-opacity", (d, i) =>
        i <= currentIndex ? 0.7 : 0
    );
}

//------------------------------------------------------
// 4) TOOLTIP
//------------------------------------------------------

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

//------------------------------------------------------
// 5) OPTIONAL STATIC FILE OVERVIEW (NON-SCROLLY)
//------------------------------------------------------

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

//------------------------------------------------------
// 6) SECOND SCROLLY (FILE SIZES)
//------------------------------------------------------

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

//------------------------------------------------------
// 7) DOMContentLoaded
//------------------------------------------------------

document.addEventListener("DOMContentLoaded", async () => {
    await loadData();
    // 1) Display stats and draw chart once
    displayData();
    drawFullScatterPlot();

    // 2) Optional static file overview
    displayCommitFiles();

    // -------------- FIRST SCROLLY (Commits) --------------
    const scrollContainer = d3.select("#scroll-container");
    const scrollContainerEl = document.getElementById("scroll-container");
    const containerHeight = scrollContainerEl.getBoundingClientRect().height;

    const itemsContainer = d3.select("#items-container");
    const spacer = d3.select("#spacer");

    // Add extra "buffer" so the last commit can reach the top
    const totalHeight = commits.length * ITEM_HEIGHT + containerHeight;
    spacer.style("height", `${totalHeight}px`);

    // Render text for each commit
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

    // On scroll, figure out currentIndex and reveal circles
    scrollContainer.on("scroll", () => {
        const scrollTop = Math.max(0, scrollContainer.property("scrollTop"));
        let currentIndex = Math.floor(scrollTop / ITEM_HEIGHT);
        currentIndex = Math.min(currentIndex, commits.length - 1);

        // Show circles up to currentIndex
        updateVisibleCommits(currentIndex);

        // Update the date label
        const currentCommit = commits[currentIndex];
        d3.select("#scroll-date").text(
            currentCommit.datetime.toLocaleString("en", {
                dateStyle: "long",
                timeStyle: "short",
            })
        );
    });

    // Initially show the first commit
    updateVisibleCommits(0);

    // -------------- SECOND SCROLLY (File Sizes) --------------
    const file_scrollContainer = d3.select("#file-scroll-container");
    const fileScrollContainerEl = document.getElementById(
        "file-scroll-container"
    );
    const fileContainerHeight =
        fileScrollContainerEl.getBoundingClientRect().height;

    const file_itemsContainer = d3.select("#file-items-container");
    const file_spacer = d3.select("#file-spacer");

    // Again, add container height to ensure last items can become active
    const fileTotalHeight = commits.length * ITEM_HEIGHT + fileContainerHeight;
    file_spacer.style("height", `${fileTotalHeight}px`);

    // Render text blocks for all commits
    renderAllFileCommits();

    // On scroll, figure out the active commit's time threshold
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

    // Initialize pinned file list for the earliest commit
    const fileDataSlice = getFileDataFiltered(commits[0].datetime);
    updateFileVisualization(fileDataSlice);
});
