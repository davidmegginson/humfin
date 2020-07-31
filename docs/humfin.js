///////////////////////////////////////////////////////////////////////
// Look up humanitarian activities in the IATI Datastore
////////////////////////////////////////////////////////////////////////

/**
 * Top-level namespace
 */
var humfin = {
}


//
// Codelists (TODO - move to separate JSON file)
//
humfin.activity_status = {
    1: "Pipeline/Identification",
    2: "Implementation",
    3: "Finalisation",
    4: "Closed",
    5: "Cancelled",
    6: "Suspended"
};


//
// Functions
//

/**
 * Build a Solr search query
 */
humfin.buildQuery = function (params) {

    // Tweaks

    if (params.year) {
        params.dateFrom = params.year + "-01-01";
        params.dateTo = params.year + "-12-31";
    }


    // list of Solr search terms that will be joined by " AND "
    var terms = [];

    if (params.countries) {
        // TODO validate country codes
        terms.push("(recipient_country_code:(" + params.countries.join(" ") + "))");
    }

    if (params.humanitarian) {
        terms.push("(humanitarian:(1) OR sector_code(720 730 740))");
    }

    if (params.dateFrom) {
        // TODO validate date and add time if needed
        terms.push(
            "(activity_date_end_actual:["
                + params.dateFrom
                + " TO *] OR (-activity_date_end_actual:[* TO *] AND activity_date_end_planned:["
                + params.dateFrom
                + " TO *]))"
        );
    }

    if (params.dateTo) {
        // TODO validate date and add time if needed
        terms.push(
            "(activity_date_start_actual:[* TO "
                + params.dateTo
                + "] OR (-activity_date_start_actual:[* TO *] AND activity_date_start_planned:[* TO "
                + params.dateTo
                + "]))"
        );
    }

    // if there are no terms, push a wildcard
    if (terms.length == 0) {
        terms.push("*.*");
    }

    return terms.join(" AND ");
}


/**
 * Return all activities matching the parameters
 */
humfin.getActivitiesPromise = function (params) {

    if (!params) {
        params = {};
    }
    
    const promise = new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();

        const url = "https://iatidatastore.iatistandard.org/search/activity?wt=json&rows=999999&q=" + encodeURIComponent(humfin.buildQuery(params));

        console.log(url);

        request.responseType = 'json';
        request.open("GET", url);

        request.onload = () => {
            if (request.status == 200) {
                resolve(request.response.response.docs);
            } else {
                reject(Error(request.statusText));
            }
        };

        request.onerror = () => {
            reject(Error("Error fetching data."));
        };

        request.send();
    });

    return promise;
};


humfin.getCountriesPromise = function () {
    const promise = new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();

        request.responseType = 'json';
        request.open("GET", "countries.json");

        request.onload = () => {
            if (request.status == 200) {
                resolve(request.response);
            } else {
                reject(Error(request.statusText));
            }
        };

        request.onerror = () => {
            reject(Error("Error fetching data."));
        };

        request.send();
    });

    return promise;

};


//
// Populate the HTML page on start
//
window.onload = () => {

    function labeledText(label, text) {
        const node = document.createElement("dd");
        node.className = "labeled-text";

        const labelNode = document.createElement("span");
        labelNode.className = "label";
        
        const textNode = document.createElement("span");
        textNode.className = "text";
        
        labelNode.textContent = label + ": ";
        textNode.textContent = text;
        node.appendChild(labelNode);
        node.appendChild(textNode);
        return node;
    }

    function formatNumber(num) {
        return num.toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,')
    }    

    const getParams = new URLSearchParams(window.location.search);

    var country = getParams.get("country");
    if (!country) {
        country = "SY";
    }

    const thisYear = new Date().getFullYear();
    var year = getParams.get("year");
    if (!year) {
        year = thisYear
    }

    const params = {
        countries: [country],
        year: year,
        humanitarian: true
    };

    const countriesPromise = humfin.getCountriesPromise();
    countriesPromise.catch((e) => {
        console.error(e);
        alert("Error loading country codes: " + e);
    });

    const iatiPromise = humfin.getActivitiesPromise(params);
    countriesPromise.catch((e) => {
        console.error(e);
        alert("Error querying IATI datastore: " + e);
    });


    Promise.all([countriesPromise, iatiPromise]).then((results) => {

        const countries = results[0];
        const activities = results[1];
        var countryName = "[Unknown]";

        // Set up the countries dropdown and get the current country name
        const countryNode = document.getElementById("field-country");
        countryNode.innerHTML = "";
        countries.forEach((entry) => {
            var sel = document.createElement("option");
            var index = entry[1].lastIndexOf(" (");
            if (index != -1) {
                entry[1] = entry[1].substring(0, index + 1);
            }
            if (entry[0] == country) {
                sel.setAttribute("selected", "selected");
                countryName = entry[1];
            }
            sel.setAttribute("value", entry[0]);
            sel.textContent = entry[1];
            countryNode.appendChild(sel);
        });

        const yearNode = document.getElementById("field-year");
        yearNode.value = year;
        yearNode.max = thisYear + 5;

        

        var count = document.getElementById("count");
        count.textContent = "Humanitarian activities for " + params.year + " in " + countryName + " (" + activities.length + ")";
        
        var container = document.getElementById("activities");
        container.innerHTML = "";
        activities.forEach((activity) => {
            var entry = document.createElement("dt");
            var link = document.createElement("a");
            link.setAttribute("href", "http://d-portal.org/q.html?aid=" + encodeURIComponent(activity.iati_identifier));
            link.setAttribute("target", "_blank");
            if (activity.title_narrative_text) {
                link.textContent = activity.title_narrative_text[0];
            } else {
                link.textContent = activity.iati_identifier;
            }
            entry.appendChild(link);
            container.appendChild(entry);

            container.appendChild(labeledText(
                "IATI identifier",
                activity.iati_identifier
            ));

            container.appendChild(labeledText(
                "Status",
                humfin.activity_status[activity.activity_status_code]
            ));

            if (activity.reporting_org_narrative) {
                container.appendChild(labeledText(
                    "Reporting org",
                    activity.reporting_org_narrative[0]
                ));
            }

            if (activity.participating_org_narrative) {
                container.appendChild(labeledText(
                    "Participating orgs",
                    [...new Set(activity.participating_org_narrative)].join(", ")
                ));
            }

            if (activity.budget_value) {
                container.appendChild(labeledText(
                    "Budget",
                    "" + activity.budget_value_currency[0] + " " + formatNumber(activity.budget_value[0])
                ));
            }

            if (activity.sector_code) {
                container.appendChild(labeledText(
                    "Sector codes",
                    [...new Set(activity.sector_code)].join(", ")
                ));
            }

            if (activity.recipient_country_code) {
                container.appendChild(labeledText(
                    "Recipient countries",
                    [...new Set(activity.recipient_country_code)].join(", ")
                ));
            }

            if (activity.description_narrative) {
                container.appendChild(labeledText(
                    "Description",
                    activity.description_narrative[0]
                ));
            }

        });
    });
};
