document.addEventListener("DOMContentLoaded", async () => {
    await loadData();
});

let data = [];
let commits = [];

async function loadData() {
    data = await d3.csv("/meta/loc.csv", (row) => ({
        ...row,
        line: Number(row.line),
        depth: Number(row.depth),
        length: Number(row.length),
        date: new Date(row.date + "T00:00" + row.timezone),
        datetime: new Date(row.datetime),
    }));
    displayStats();
    createScatterplot();
}

function processCommits() {
    commits = d3
        .groups(data, (d) => d.commit)
        .map(([commit, lines]) => {
            let first = lines[0];
            let { author, date, time, timezone, datetime } = first;
            let ret = {
                id: commit,
                url: "https://github.com/YOUR_REPO/commit/" + commit,
                author,
                date,
                time,
                timezone,
                datetime,
                hourFrac: datetime.getHours() + datetime.getMinutes() / 60,
                totalLines: lines.length,
            };

            Object.defineProperty(ret, "lines", {
                value: lines,
                configurable: false,
                writable: false,
                enumerable: false,
            });

            return ret;
        });
}

function displayStats() {
    processCommits();

    const statsData = [
        { label: "COMMITS", value: commits.length },
        { label: "FILES", value: d3.group(data, (d) => d.file).size },
        { label: "TOTAL LOC", value: data.length },
        { label: "MAX DEPTH", value: d3.max(data, (d) => d.depth) },
        { label: "LONGEST LINE", value: d3.max(data, (d) => d.length) },
        { label: "MAX LINES", value: d3.max(data, (d) => d.line) },
    ];

    const labelsContainer = d3.select("#stats-labels");
    labelsContainer.html("");
    labelsContainer
        .selectAll(".stat-label")
        .data(statsData)
        .enter()
        .append("div")
        .attr("class", "stat-label")
        .text((d) => d.label);

    const valuesContainer = d3.select("#stats-values");
    valuesContainer.html("");
    valuesContainer
        .selectAll(".stat-value")
        .data(statsData)
        .enter()
        .append("div")
        .attr("class", "stat-value")
        .text((d) => d.value);
}

function createScatterplot() {
    if (commits.length === 0) return;

    const width = 1000;
    const height = 600;
    const margin = { top: 10, right: 10, bottom: 30, left: 50 };

    const usableArea = {
        top: margin.top,
        right: width - margin.right,
        bottom: height - margin.bottom,
        left: margin.left,
        width: width - margin.left - margin.right,
        height: height - margin.top - margin.bottom,
    };

    const svg = d3
        .select("#chart")
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .style("overflow", "visible");

    const xScale = d3
        .scaleTime()
        .domain(d3.extent(commits, (d) => d.datetime))
        .range([usableArea.left, usableArea.right])
        .nice();

    const yScale = d3
        .scaleLinear()
        .domain([0, 24])
        .range([usableArea.bottom, usableArea.top]);

    // Add gridlines before axes
    const gridlines = svg
        .append("g")
        .attr("class", "gridlines")
        .attr("transform", `translate(${usableArea.left}, 0)`)
        .call(d3.axisLeft(yScale).tickFormat("").tickSize(-usableArea.width));

    // Create the axes
    const xAxis = d3.axisBottom(xScale);
    const yAxis = d3
        .axisLeft(yScale)
        .tickFormat((d) => String(d % 24).padStart(2, "0") + ":00");

    // Add X axis
    svg.append("g")
        .attr("transform", `translate(0, ${usableArea.bottom})`)
        .call(xAxis);

    // Add Y axis
    svg.append("g")
        .attr("transform", `translate(${usableArea.left}, 0)`)
        .call(yAxis);

    // Draw scatterplot dots
    const dots = svg.append("g").attr("class", "dots");

    dots.selectAll("circle")
        .data(commits)
        .join("circle")
        .attr("cx", (d) => xScale(d.datetime))
        .attr("cy", (d) => yScale(d.hourFrac))
        .attr("r", 5)
        .attr("fill", "steelblue");
}
