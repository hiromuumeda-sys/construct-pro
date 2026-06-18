graph TB
    A["<b>クライアント</b><br/>(複数拠点)<br/>ブラウザ<br/>PC/タブレット"]
    
    A -->|HTTPS| B["<b>Railway</b>"]
    
    B --> C["<b>Node.js + Express</b><br/>CONSTRUCT_PRO<br/><br/>APIエンドポイント<br/>PDF生成<br/>メール送信"]
    
    C -->|SQL| D["<b>PostgreSQL</b><br/>Row Level Security"]
    C -->|保存| E["<b>AWS S3</b><br/>PDF・ファイル"]
    C -->|送信| F["<b>SendGrid</b><br/>または<br/>AWS SES"]
    
    style A fill:#606060,color:#fff,stroke:#fff,stroke-width:3px
    style B fill:#606060,color:#fff,stroke:#fff,stroke-width:3px
    style C fill:#505050,color:#fff,stroke:#fff,stroke-width:3px
    style D fill:#303030,color:#fff,stroke:#fff,stroke-width:3px
    style E fill:#505050,color:#fff,stroke:#fff,stroke-width:3px
    style F fill:#505050,color:#fff,stroke:#fff,stroke-width:3px
