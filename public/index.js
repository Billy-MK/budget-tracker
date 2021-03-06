let transactions = [];
let myChart;

getRecords();

function populateTotal() {
  // reduce transaction amounts to a single total value
  let total = transactions.reduce((total, t) => {
    return total + parseInt(t.value);
  }, 0);

  let totalEl = document.querySelector("#total");
  totalEl.textContent = total;
}

function populateTable() {
  let tbody = document.querySelector("#tbody");
  tbody.innerHTML = "";

  transactions.forEach(transaction => {
    // create and populate a table row
    let tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${transaction.name}</td>
      <td>${transaction.value}</td>
    `;

    tbody.appendChild(tr);
  });
}

function populateChart() {
  // copy array and reverse it
  let reversed = transactions.slice().reverse();
  let sum = 0;

  // create date labels for chart
  let labels = reversed.map(t => {
    let date = new Date(t.date);
    return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
  });

  // create incremental values for chart
  let data = reversed.map(t => {
    sum += parseInt(t.value);
    return sum;
  });

  // remove old chart if it exists
  if (myChart) {
    myChart.destroy();
  }

  let ctx = document.getElementById("myChart").getContext("2d");

  myChart = new Chart(ctx, {
    type: 'line',
      data: {
        labels,
        datasets: [{
            label: "Total Over Time",
            fill: true,
            backgroundColor: "#6666ff",
            data
        }]
    }
  });
}

function sendTransaction(isAdding) {
  let nameEl = document.querySelector("#t-name");
  let amountEl = document.querySelector("#t-amount");
  let errorEl = document.querySelector(".form .error");

  // validate form
  if (nameEl.value === "" || amountEl.value === "") {
    errorEl.textContent = "Missing Information";
    return;
  }
  else {
    errorEl.textContent = "";
  }

  // create record
  let transaction = {
    name: nameEl.value,
    value: amountEl.value,
    date: new Date().toISOString()
  };

  // if subtracting funds, convert amount to negative number
  if (!isAdding) {
    transaction.value *= -1;
  }

  // add to beginning of current array of data
  transactions.unshift(transaction);

  // re-run logic to populate ui with new record
  
  populateTable();
  populateTotal();
  
  // also send to server
  fetch("/api/transaction", {
    method: "POST",
    body: JSON.stringify(transaction),
    headers: {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json"
    }
  })
  .then(response => {    
    populateChart();
    return response.json();
  })
  .then(data => {
    if (data.errors) {
      errorEl.textContent = "Missing Information";
    }
    else {
      // clear form
      nameEl.value = "";
      amountEl.value = "";
    }
  })
  .catch(err => {
    // fetch failed, so save in indexed db
    saveRecord(transaction);

    // clear form
    nameEl.value = "";
    amountEl.value = "";
  });
}

function saveRecord(data) {
  // Transactions look like this: 
  // {name: "asdfasdf", value: "1", date: "2021-04-29T18:24:52.972Z"}
  const request = indexedDB.open("transactionDB", 1);

  request.onupgradeneeded = ({ target }) => {
    console.log(`Upgrade database: ${request.result}`)
    const db = target.result;

    const objectStore = db.createObjectStore("transactions", { keyPath: 'id', autoIncrement: true });
    objectStore.createIndex("name", "name");
    objectStore.createIndex("value", "value");
    objectStore.createIndex("date", "date");
  };
  
  request.onsuccess = event => {
    const db = request.result;
    const transaction = db.transaction(["transactions"], "readwrite");
    const transactionStore = transaction.objectStore("transactions");
    transactionStore.add(data)
  };

  request.onerror = event => {
    console.log(`Error: ${request.error}`)
  }
}

// Returns all transactions from the database and pushes them to the transactions array
function getRecords() {
  const request = indexedDB.open("transactionDB");

  request.onupgradeneeded = ({ target }) => {
    const db = target.result;

    const objectStore = db.createObjectStore("transactions", { keyPath: 'id', autoIncrement: true });
    objectStore.createIndex("name", "name", { unique: false });
    objectStore.createIndex("value", "value", { unique: false });
    objectStore.createIndex("date", "date", { unique: false });
  };
  
  request.onsuccess = event => {
    const db = request.result;
    const transaction = db.transaction(["transactions"], "readwrite");
    const transactionStore = transaction.objectStore("transactions");
    transactionStore.getAll().onsuccess = async function(event) {
      console.log("Got all stored transactions: " + JSON.stringify(event.target.result));
      await fetch("/api/transaction/bulk", {
        method: "POST",
        body: JSON.stringify(event.target.result),
        headers: {
          Accept: "application/json, text/plain, */*",
          "Content-Type": "application/json"
        }
      })
      .then(response => {
          const transaction = db.transaction(["transactions"], "readwrite");
          const transactionStore = transaction.objectStore("transactions");
          transactionStore.clear("")
          populateChart();
          return response.json();
      }).then(
        fetch("/api/transaction")
          .then(response => {
            return response.json();
          })
          .then(data => {
          // save db data on global variable
            transactions = data;

            populateTotal();
            populateTable();
            populateChart();
          })
      )
      .catch(err => {
        console.log(err)
      }) 
    };
    
  };

  request.onerror = event => {
    console.log(`Error: ${request.error}`)
  }

}

document.querySelector("#add-btn").onclick = function() {
  sendTransaction(true);
};

document.querySelector("#sub-btn").onclick = function() {
  sendTransaction(false);
};
