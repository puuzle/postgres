


async function getTableNames() {
    return await fetch('/table-names').then(res => res.json());
}

async function getTable(name) {
    return await fetch('/tables/' + name).then(res => res.json());
}

async function fillTableNames() {
    const data = await getTableNames();
    const tableNames = document.getElementById('table-names');
    for (let i = 0; i < data.length; i++) {
        const name = data[i];
        const button = document.createElement('button');
        button.className = 'table-button';
        button.onclick = async function() {
            const tableNames = document.getElementById('table-names');
            tableNames.style.display = 'none';
            await fillTable(name);
        }
        button.textContent = name;
        tableNames.append(button);
    }
}

async function fillTable(name) {
    const data = await getTable(name);
    const first = data[0];

    const tableName = document.createElement('span');
    tableName.className = 'table-name';

    const table = document.createElement('div');
    table.id = 'table';
    if (!first) {
        tableName.textContent = name + ' - no data';
        tableName.style.borderRadius = '5px';
        table.append(tableName);
    } else {
        tableName.textContent = name;
        table.append(tableName);

        const cc = document.createElement('div');
        cc.className = 'column-container';
        Object.keys(first).forEach((k, i, arr) => {
            const cw = document.createElement('div');
            cw.className = 'column-wrapper';
            if (i === arr.length - 1) cw.style.borderRight = 'none';
    
            const span = document.createElement('span');
            span.className = 'column-name';
            span.textContent = k;
            cw.append(span);
            for (let i = 0; i < data.length; i++) {
                const button = document.createElement('button');
                button.className = 'column-value';
                button.onclick = function() {
                }
                button.textContent = data[i][k];
                cw.append(button);
            }
            cc.append(cw);
        });
        table.append(cc);

        const plus = document.getElementById('plus').cloneNode(true);
        plus.removeAttribute('id');
        plus.classList.add('column-add');
        plus.onclick = function() {
        }
        table.append(plus);

        const dc = document.createElement('div');
        dc.className = 'delete-container';

        let button = document.createElement('button');
        button.className = 'drop-button';
        button.onclick = function() {
        }
        button.textContent = 'Drop ' + name;
        dc.append(button);

        button = document.createElement('button');
        button.className = 'delete-button';
        button.onclick = function() {
        }
        button.textContent = 'Delete Column';
        dc.append(button);

        table.append(dc);
    }
    const oldTable = document.getElementById('table');
    if (!oldTable) {
        const container = document.getElementById('container');
        container.prepend(table);
    } else oldTable.replaceWith(table);
    /*
    for (const k in first) {
        /*
        let span = document.createElement('span');
        span.className = 'column-name';
        span.textContent = k;
        cnc.append(span);
        

        const cvw = document.createElement('div');
        cvw.id = k;
        cvw.className = 'column-value-wrapper';

        const span = document.createElement('span');
        span.className = 'column-name-hidden';
        span.textContent = k;
        cvw.append(span);
        for (let i = 0; i < data.length; i++) {
            const button = document.createElement('button');
            button.className = 'column-value';
            button.onclick = function() {
            }
            button.textContent = data[i][k];
            cvw.append(button);
        }
        cvc.append(cvw);
        wrappers.push(cvw);
    }
    const cc = document.createElement('div');
    cc.className = 'column-container';
    cc.append(cvc);

    

    const cnc = document.createElement('div');
    cnc.className = 'column-name-container';
    setTimeout(() => {
        Object.keys(first).forEach((k, i) => {
            const span = document.createElement('span');
            span.id = i;
            span.className = 'column-name';
            span.textContent = k;
            console.log(span.textContent, document.getElementById(k).clientWidth);
            //span.style.width = document.getElementById(k).clientWidth + 'px';
            cnc.append(span);
        });
        cc.prepend(cnc);
    }, 100);
    */
}

function filterTableNames() {
    const children = document.getElementById('table-names').children;
    for (const child of children) {
        if (child.textContent.toLowerCase().includes(this.value.toLowerCase())) child.style.display = '';
        else child.style.display = 'none';
    }
}

function showTableNames() {
    const tableNames = document.getElementById('table-names');
    tableNames.style.display = 'flex';
}

function hideTableNames() {
    setTimeout(() => {
        const tableNames = document.getElementById('table-names');
        if (!tableNames.contains(document.activeElement)) tableNames.style.display = 'none';
    }, 0);
}

(async () => {
    await fillTableNames();
    const tableNames = document.getElementById('table-names');
    const first = tableNames.children[0];
    if (!first) {
        const tableName = document.getElementById('table-name');
        tableName.textContent = 'No tables';
        return;
    }
    await fillTable(first.textContent);
})();