export const title = "Dashboard";

export async function mount({ content, actions }) {
    actions.innerHTML = "";
    content.innerHTML = `
        <section class="dashboard-welcome">
            <div>
                <h2>교재팀 Dashboard</h2>
                <p>왼쪽 메뉴에서 조회할 통계를 선택해 주십시오.</p>
            </div>
        </section>
    `;
}

export function unmount() {}
