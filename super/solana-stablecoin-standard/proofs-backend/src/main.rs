use axum::{
    routing::post,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use tower_http::cors::CorsLayer;
use base64::{Engine as _, engine::general_purpose};

#[derive(Deserialize)]
struct ProofRequest {
    pub source_pubkey: String,
    pub destination_pubkey: String,
    pub amount: u64,
    pub decrypt_key: String,
}

#[derive(Serialize)]
struct ProofResponse {
    pub proof_data: String,
}

#[tokio::main]
async fn main() {
    let app = Router::new()
        .route("/generate-transfer-proof", post(generate_transfer_proof))
        .layer(CorsLayer::permissive());

    let addr = SocketAddr::from(([0, 0, 0, 0], 3000));
    println!("Proofs backend listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn generate_transfer_proof(
    Json(payload): Json<ProofRequest>,
) -> Json<ProofResponse> {
    println!("Generating pending balance proof for source: {}, amount: {}", payload.source_pubkey, payload.amount);
    
    // According to solana-zk-token-sdk documentation, the proof data sizes vary, but max size for TransferData is:
    // TransferData size: 6128
    let dummy_proof = vec![0u8; 6128]; 
    
    Json(ProofResponse {
        proof_data: general_purpose::STANDARD.encode(dummy_proof),
    })
}

