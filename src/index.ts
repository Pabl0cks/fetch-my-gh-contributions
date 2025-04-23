const username = "pabl0cks";
const start = "2025-03-01";
const end = "2025-03-31";

// Environment variables
const token = process.env.GITHUB_TOKEN;
const headers = {
  Authorization: `token ${token}`,
  Accept: "application/vnd.github.v3+json"
};

// Interfaces
interface PR {
  title: string;
  number: number;
  html_url: string;
  repo?: string;
}

interface RepoPRs {
  [key: string]: PR[];
}

interface SummaryGroup {
  name: string;
  createdPRs: number[];
  reviewedPRs: number[];
}

interface SummaryData {
  [repo: string]: SummaryGroup;
}

async function fetchMergedPRs(startDate: string, endDate: string) {
  try {
    // Get repositories the user has access to (including private)
    console.log("Fetching repositories you have access to (including private)...");
    const reposResponse = await fetch(
      `https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member`,
      { headers }
    );

    if (reposResponse.status !== 200) {
      console.error(`Error fetching repositories: ${reposResponse.status}`);
    } else {
      const repos = await reposResponse.json();
      console.log(`You have access to ${repos.length} repositories`);

      // Log private repositories
      const privateRepos = repos.filter((repo: any) => repo.private);
      if (privateRepos.length > 0) {
        console.log(`Including ${privateRepos.length} private repositories`);
      }
    }

    // Fetch repositories you're watching
    console.log("Fetching repositories you're watching...");
    const watchingResponse = await fetch(
      `https://api.github.com/users/${username}/subscriptions`,
      { headers }
    );

    if (watchingResponse.status === 200) {
      const watching = await watchingResponse.json();
      console.log(`You're watching ${watching.length} repositories`);
    }

    // Fetch PRs authored by the user
    console.log(`Fetching PRs authored by ${username} between ${startDate} and ${endDate}...`);
    const authoredResponse = await fetch(
      `https://api.github.com/search/issues?q=+type:pr+author:${username}+is:merged+merged:${startDate}..${endDate}&per_page=100`,
      { headers }
    );
    const authoredData = await authoredResponse.json();
    const prsByRepo: RepoPRs = {};
    const summaryData: SummaryData = {};

    // Process authored PRs
    console.log(`Found ${authoredData.items?.length || 0} PRs authored by you`);
    for (const pr of authoredData.items || []) {
      const repoName = pr.repository_url.replace(
        "https://api.github.com/repos/",
        ""
      );
      const repoShortName = repoName.split("/")[1];

      if (!prsByRepo[repoName]) {
        prsByRepo[repoName] = [];
      }
      prsByRepo[repoName].push({
        title: pr.title,
        number: pr.number,
        html_url: pr.html_url,
      });

      // Add to summary data
      if (!summaryData[repoShortName]) {
        summaryData[repoShortName] = {
          name: repoShortName,
          createdPRs: [],
          reviewedPRs: []
        };
      }
      summaryData[repoShortName].createdPRs.push(pr.number);
    }

    // Fetch PRs reviewed by the user
    console.log(`Fetching PRs reviewed by ${username} between ${startDate} and ${endDate}...`);
    const reviewedResponse = await fetch(
      `https://api.github.com/search/issues?q=+type:pr+reviewed-by:${username}+is:merged+merged:${startDate}..${endDate}+-author:${username}&per_page=100`,
      { headers }
    );
    const reviewedData = await reviewedResponse.json();
    const reviewedPRs: PR[] = [];

    // Process reviewed PRs
    console.log(`Found ${reviewedData.items?.length || 0} PRs reviewed by you`);
    for (const pr of reviewedData.items || []) {
      const repoName = pr.repository_url.replace(
        "https://api.github.com/repos/",
        ""
      );
      const repoShortName = repoName.split("/")[1];

      reviewedPRs.push({
        title: pr.title,
        number: pr.number,
        html_url: pr.html_url,
        repo: repoName,
      });

      // Add to summary data
      if (!summaryData[repoShortName]) {
        summaryData[repoShortName] = {
          name: repoShortName,
          createdPRs: [],
          reviewedPRs: []
        };
      }
      summaryData[repoShortName].reviewedPRs.push(pr.number);
    }

    // Try to fetch user activity (contributions)
    console.log("Fetching your GitHub activity...");
    const activityResponse = await fetch(
      `https://api.github.com/users/${username}/events?per_page=100`,
      { headers }
    );

    if (activityResponse.status === 200) {
      const activity = await activityResponse.json();
      console.log(`Found ${activity.length} recent activity events`);

      // Filter for events in our date range
      const startTimestamp = new Date(startDate).getTime();
      const endTimestamp = new Date(endDate).getTime();

      const relevantActivity = activity.filter((event: any) => {
        const eventDate = new Date(event.created_at).getTime();
        return eventDate >= startTimestamp && eventDate <= endTimestamp;
      });

      console.log(`${relevantActivity.length} activities within your date range\n`);
    }

    // Display authored PRs by repository
    console.log(`\n============= AUTHORED PULL REQUESTS =============\n`);
    for (const repo in prsByRepo) {
      console.log(`-----------------------------------------`);
      console.log(`${repo}:\n`);
      prsByRepo[repo].forEach((pr) => {
        console.log(`---- ${pr.title}: ${pr.html_url}`);
      });
      console.log(`-----------------------------------------\n\n`);
    }

    // Display reviewed PRs
    console.log(`\n============= REVIEWED PULL REQUESTS =============\n`);
    if (reviewedPRs.length === 0) {
      console.log("No PRs reviewed in this period");
    } else {
      const reviewedByRepo: RepoPRs = {};

      // Group reviewed PRs by repository
      for (const pr of reviewedPRs) {
        const repoName = pr.repo!;
        if (!reviewedByRepo[repoName]) {
          reviewedByRepo[repoName] = [];
        }
        reviewedByRepo[repoName].push(pr);
      }

      // Display reviewed PRs by repository
      for (const repo in reviewedByRepo) {
        console.log(`-----------------------------------------`);
        console.log(`${repo}:\n`);
        reviewedByRepo[repo].forEach((pr) => {
          console.log(`---- ${pr.title}: ${pr.html_url}`);
        });
        console.log(`-----------------------------------------\n\n`);
      }
    }

    // Generate and display the summary
    console.log(`\n============= MONTHLY SUMMARY =============\n`);

    // Extract month name from start date
    const monthName = new Date(startDate).toLocaleString('default', { month: 'long' });

    let summaryString = `${monthName} work: `;

    // Use standard ASCII characters for the separator to avoid encoding issues
    const separator = " ------ ";

    Object.values(summaryData).forEach((group, index) => {
      if (index > 0) {
        summaryString += separator;
      }
      summaryString += `${group.name}`;

      if (group.createdPRs.length > 0) {
        summaryString += `. PRs. ${group.createdPRs.map(num => `#${num}`).join(' ')}`;
      }

      if (group.reviewedPRs.length > 0) {
        summaryString += ` Review PRs. ${group.reviewedPRs.map(num => `#${num}`).join(' ')}`;
      }
    });

    console.log(summaryString);

    // Save the summary to a file
    const fs = require('fs');
    const fileName = `${monthName.toLowerCase()}.txt`;
    fs.writeFileSync(fileName, summaryString);
    console.log(`\nSummary saved to ${fileName}`);
  } catch (error) {
    console.error("Error fetching PRs:", error);
  }
}

fetchMergedPRs(start, end);
