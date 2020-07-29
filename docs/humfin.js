////////////////////////////////////////////////////////////////////////
// Look up humanitarian activities in the IATI Datastore
////////////////////////////////////////////////////////////////////////

/**
 * Top-level namespace
 */
var humfin = {}


/**
 * Build a Solr search query
 */
humfin.buildQuery = function (params) {

    var query = "";

    function addTerm (term) {
        if (!query) {
            query = term;
        } else {
            query += " AND " + term;
        }
    }

    if (params.countries) {
        // TODO validate country codes
        addTerm("recipient_country_code:(" + params.countries.join(" ") + ")");
    }

    if (params.humanitarian) {
        addTerm("(humanitarian:(1) OR sector_code(720 730 740))");
    }

    if (params.dateAfter) {
        // TODO validate date and add time if needed
        addTerm("(activity_date_end_actual_f:[" + params.dateAfter + " TO *] OR (-activity_date_end_actual_f:[* TO *] AND activity_date_end_planned_f:[" + params.dateAfter + " TO *]))");
    }

    if (!query) {
        query = "*.*";
    }

    return query;
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

        request.responseType = 'json';
        request.open("GET", url);

        request.onload = () => {
            if (request.status == 200) {
                console.log(request.response);
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

    var countryNode = document.getElementById("country");
    countryNode.value = country;

    var params = {
        countries: [country],
        dateAfter: "2020-01-01T00:00:00Z",
        humanitarian: true
    };

    var promise = humfin.getActivitiesPromise(params);
    promise.then((activities) => {

        var count = document.getElementById("count");
        count.textContent = "Humanitarian activities from " + params.dateAfter.substring(0, 10) + " in " + params.countries[0] + " (" + activities.length + ")";
        
        var container = document.getElementById("activities");
        container.innerHTML = "";
        activities.forEach((activity) => {
            var entry = document.createElement("dt");
            if (activity.title_narrative_text) {
                entry.textContent = activity.title_narrative_text[0];
            } else {
                entry.textContent = "** No title **";
            }
            container.appendChild(entry);

            if (activity.budget_value) {
                container.appendChild(labeledText(
                    "Budget",
                    "" + activity.budget_value_currency[0] + " " + formatNumber(activity.budget_value[0])
                ));
            }

            if (activity.participating_org_narrative) {
                container.appendChild(labeledText(
                    "Participating orgs",
                    activity.participating_org_narrative.join(", ")
                ));
            }

            if (activity.sector_code) {
                container.appendChild(labeledText(
                    "Sector codes",
                    activity.sector_code.join(", ")
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
