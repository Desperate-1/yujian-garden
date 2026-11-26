const host = document.documentElement.dataset.host || '糖糖';
const knock = document.getElementById('paperGarden')?.dataset.knock || '';

export const visitPages = {
    candy: [
        {label: '敲敲门环', hint: '点门环敲门，也可以直接进屋找'+host+'。'},
        {label: '和'+host+'道别', hint: knock+'点她或门口，进屋聊天。'}
    ],
    journal: [
        {label: '抽出纸笺', hint: '点树洞里的信封抽出题笺，也可以直接去写日记。'},
        {label: '把纸笺收好', hint: '「今天，有哪件小事值得记住？」点纸笺，坐下写日记。'}
    ],
    gallery: [
        {label: '翻看下一幅', hint: '《浅汀》 · 点画框翻看下一幅，也可以直接走进展厅。'},
        {label: '翻看下一幅', hint: '《枝头》 · 再点一次画框，走进展厅。'},
        {label: '翻看下一幅', hint: '《池上》 · 点画框，走进展厅。'}
    ]
};
