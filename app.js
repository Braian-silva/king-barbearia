// ============================================================
// KING BARBEARIA — APP.JS
// ============================================================


// ============================================================
// UTILITÁRIOS
// ============================================================

function $(id) {
    return document.getElementById(id);
}


const brl = (value) => {
    return "R$ " + Number(value)
        .toFixed(2)
        .replace(".", ",");
};


const esc = (value) => {
    return String(value ?? "").replace(
        /[&<>"']/g,
        (char) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[char]
    );
};


// ============================================================
// DATA LOCAL
// ============================================================

function localISO(date = new Date()) {
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
    ].join("-");
}


const todayISO = localISO();


// ============================================================
// CONFIGURAÇÃO INICIAL
// ============================================================

$("date").min = todayISO;
$("dateAgenda").min = todayISO;

$("date").value = todayISO;
$("dateAgenda").value = todayISO;


// ============================================================
// SERVIÇOS
// ============================================================

async function loadServices() {

    const serviceSelect = $("service");
    const servicesContainer = $("services");

    try {

        const response = await fetch("/api/services");

        if (!response.ok) {
            throw new Error("Não foi possível carregar os serviços.");
        }

        const data = await response.json();


        // ----------------------------------------------------
        // SELECT DE SERVIÇOS
        // ----------------------------------------------------

        serviceSelect.innerHTML = `
            <option value="">
                Selecione um serviço
            </option>

            ${data.map(service => `
                <option value="${service.id}">
                    ${esc(service.name)} — ${brl(service.price)}
                </option>
            `).join("")}
        `;


        // ----------------------------------------------------
        // CARDS DE SERVIÇOS
        // ----------------------------------------------------

        servicesContainer.innerHTML = data.length
            ? data.map(service => `
                <div class="card">

                    <h3>
                        ${esc(service.name)}
                    </h3>

                    <p class="muted">
                        Duração aproximada:
                        ${service.duration} min.
                    </p>

                    <div class="price">
                        ${brl(service.price)}
                    </div>

                </div>
            `).join("")
            : `
                <p class="muted">
                    Nenhum serviço disponível no momento.
                </p>
            `;


    } catch (error) {

        console.error(error);

        serviceSelect.innerHTML = `
            <option value="">
                Erro ao carregar serviços
            </option>
        `;

        servicesContainer.innerHTML = `
            <p class="msg error">
                Não foi possível carregar os serviços.
            </p>
        `;

        throw error;
    }
}


// ============================================================
// BUSCAR HORÁRIOS
// ============================================================

async function fetchSlots(date) {

    if (!date) {
        return [];
    }


    const serviceId = $("service").value;


    if (!serviceId) {
        return [];
    }


    try {

        const response = await fetch(
            `/api/slots?date=${encodeURIComponent(date)}&serviceId=${encodeURIComponent(serviceId)}`
        );


        if (!response.ok) {
            return [];
        }


        return await response.json();


    } catch (error) {

        console.error("Erro ao buscar horários:", error);

        return [];
    }
}


// ============================================================
// ATUALIZAR HORÁRIOS DO FORMULÁRIO
// ============================================================

async function refreshFormTimes(keep = "") {

    const timeSelect = $("time");

    timeSelect.innerHTML = `
        <option value="">
            Carregando horários...
        </option>
    `;


    if (!$("service").value) {

        timeSelect.innerHTML = `
            <option value="">
                Selecione primeiro um serviço
            </option>
        `;

        return;
    }


    const data = await fetchSlots($("date").value);


    if (!data.length) {

        timeSelect.innerHTML = `
            <option value="">
                Nenhum horário disponível
            </option>
        `;

        return;
    }


    timeSelect.innerHTML = `
        <option value="">
            Selecione o horário
        </option>

        ${data.map(slot => `
            <option
                value="${esc(slot.time)}"
                ${slot.available ? "" : "disabled"}
            >
                ${esc(slot.time)}
                ${slot.available ? "" : " — indisponível"}
            </option>
        `).join("")}
    `;


    if (
        keep &&
        data.some(
            slot => slot.time === keep && slot.available
        )
    ) {
        timeSelect.value = keep;
    }


    updateSummary();
}


// ============================================================
// AGENDA VISUAL
// ============================================================

async function refreshAgenda() {

    const date = $("dateAgenda").value;
    const box = $("agendaSlots");


    box.innerHTML = `
        <p class="muted">
            Carregando horários...
        </p>
    `;


    if (!$("service").value) {

        box.innerHTML = `
            <p class="muted">
                Selecione um serviço para consultar os horários.
            </p>
        `;

        return;
    }


    const data = await fetchSlots(date);


    if (!data.length) {

        box.innerHTML = `
            <p class="muted">
                Nenhum horário disponível para esta data.
            </p>
        `;

        return;
    }


    box.innerHTML = data.map(slot => `
        <button
            type="button"
            class="slot ${slot.available ? "" : "off"}"
            data-time="${esc(slot.time)}"
            ${slot.available ? "" : "disabled"}
        >
            ${esc(slot.time)}
        </button>
    `).join("");


    box
        .querySelectorAll(".slot:not(.off)")
        .forEach(button => {

            button.addEventListener("click", async () => {

                const selectedTime = button.dataset.time;


                // Atualiza a data do formulário
                $("date").value = date;


                // Atualiza o horário
                await refreshFormTimes(selectedTime);


                // Marca visualmente o horário
                box
                    .querySelectorAll(".slot")
                    .forEach(slot => {
                        slot.classList.toggle(
                            "selected",
                            slot === button
                        );
                    });


                updateSummary();


                // Vai para o formulário
                $("agendar").scrollIntoView({
                    behavior: "smooth"
                });

            });

        });

}


// ============================================================
// RESUMO DO AGENDAMENTO
// ============================================================

function updateSummary() {

    const serviceSelect = $("service");

    const selectedService =
        serviceSelect.options[
            serviceSelect.selectedIndex
        ];


    if ($("summaryService")) {

        $("summaryService").textContent =
            serviceSelect.value && selectedService
                ? selectedService.textContent.trim()
                : "—";
    }


    if ($("summaryDate")) {

        const date = $("date").value;


        if (date) {

            const [year, month, day] = date.split("-");

            $("summaryDate").textContent =
                `${day}/${month}/${year}`;

        } else {

            $("summaryDate").textContent = "—";
        }
    }


    if ($("summaryTime")) {

        $("summaryTime").textContent =
            $("time").value || "—";
    }
}


// ============================================================
// ATUALIZAÇÃO GERAL
// ============================================================

async function refreshAll(keepTime = "") {

    await Promise.all([
        refreshFormTimes(keepTime),
        refreshAgenda()
    ]);

    updateSummary();
}


// ============================================================
// EVENTOS — DATA DO FORMULÁRIO
// ============================================================

$("date").addEventListener(
    "change",
    async () => {

        await refreshFormTimes();

        updateSummary();
    }
);


// ============================================================
// EVENTOS — DATA DA AGENDA
// ============================================================

$("dateAgenda").addEventListener(
    "change",
    async () => {

        await refreshAgenda();
    }
);


// ============================================================
// EVENTOS — SERVIÇO
// ============================================================

$("service").addEventListener(
    "change",
    async () => {

        await refreshAll();

        updateSummary();
    }
);


// ============================================================
// EVENTOS — HORÁRIO
// ============================================================

$("time").addEventListener(
    "change",
    () => {

        updateSummary();
    }
);


// ============================================================
// AGENDAMENTO
// ============================================================

$("form").addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();


        const button =
            event.target.querySelector(
                "button[type='submit']"
            );


        const message = $("msg");


        message.className = "msg";


        // ----------------------------------------------------
        // VALIDAÇÕES
        // ----------------------------------------------------

        if (!$("service").value) {

            message.textContent =
                "Escolha um serviço.";

            message.className =
                "msg error";

            return;
        }


        if (!$("date").value) {

            message.textContent =
                "Escolha uma data.";

            message.className =
                "msg error";

            return;
        }


        if (!$("time").value) {

            message.textContent =
                "Escolha um horário.";

            message.className =
                "msg error";

            return;
        }


        // ----------------------------------------------------
        // DADOS
        // ----------------------------------------------------

        const body = {

            name: $("name").value.trim(),

            phone: $("phone").value.trim(),

            serviceId:
                Number($("service").value),

            date: $("date").value,

            time: $("time").value

        };


        // ----------------------------------------------------
        // ENVIO
        // ----------------------------------------------------

        message.textContent =
            "Enviando agendamento...";

        button.disabled = true;


        try {

            const response = await fetch(
                "/api/bookings",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify(body)
                }
            );


            const result =
                await response.json();


            if (response.ok) {

                const [
                    year,
                    month,
                    day
                ] = body.date.split("-");


                message.textContent =
                    `${result.message || "Agendamento confirmado!"} ` +
                    `${day}/${month}/${year} às ${body.time}.`;


                message.className =
                    "msg success";


                // Limpa dados pessoais
                $("name").value = "";
                $("phone").value = "";


                // Atualiza agenda
                await refreshAll();

            } else {

                message.textContent =
                    result.error ||
                    "Não foi possível realizar o agendamento.";

                message.className =
                    "msg error";
            }


        } catch (error) {

            console.error(error);

            message.textContent =
                "Sem conexão com o servidor. Tente novamente.";

            message.className =
                "msg error";

        } finally {

            button.disabled = false;

        }


        updateSummary();

    }
);


// ============================================================
// INICIALIZAÇÃO
// ============================================================

async function init() {

    try {

        await loadServices();

        await refreshAll();

        updateSummary();

    } catch (error) {

        console.error(
            "Erro ao inicializar a aplicação:",
            error
        );

    }

}


init();