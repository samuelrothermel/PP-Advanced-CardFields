import fetch from 'node-fetch';

// set some important variables
const { CLIENT_ID, APP_SECRET } = process.env;
const base = 'https://api-m.sandbox.paypal.com';
const CALLBACK_URL =
  'https://pp-ql-best-practices.onrender.com/api/shipping-callback';

// handle response from PayPal API
const handleResponse = async response => {
  if (response.status === 200 || response.status === 201) {
    return response.json();
  }
  console.log('Error Response: ', response);
  const error = new Error(await response.text());
  error.status = response.status;
  throw error;
};

// generate access token for first-time payer
export const generateAccessToken = async () => {
  const auth = Buffer.from(CLIENT_ID + ':' + APP_SECRET).toString('base64');
  const response = await fetch(`${base}/v1/oauth2/token`, {
    method: 'post',
    body: 'grant_type=client_credentials',
    headers: {
      Authorization: `Basic ${auth}`,
    },
  });
  const jsonData = await handleResponse(response);
  return jsonData.access_token;
};

// generate access token for returning payer
export const returningAccessToken = async customerId => {
  console.log('generating access token for returning payer with customer id ');
  const auth = Buffer.from(CLIENT_ID + ':' + APP_SECRET).toString('base64');
  const response = await fetch(`${base}/v1/oauth2/token`, {
    method: 'post',
    body: `grant_type=client_credentials&response_type=id_token&target_customer_id=${customerId}`,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });
  const jsonData = await handleResponse(response);
  return jsonData.id_token;
};

// create billing agreement token
export async function createBillingAgreementToken() {
  const accessToken = await generateAccessToken();
  const res = await fetch(
    'https://api-m.sandbox.paypal.com/v1/billing-agreements/agreement-tokens',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        description: 'Billing Agreement',
        shipping_address: {
          line1: '123 Main St.',
          line2: 'Suite #4',
          city: 'New York',
          state: 'NY',
          postal_code: '12345',
          country_code: 'US',
          recipient_name: 'John Doe',
        },
        payer: {
          payment_method: 'PAYPAL',
        },
        plan: {
          type: 'MERCHANT_INITIATED_BILLING',
          merchant_preferences: {
            return_url: 'https://example.com/return',
            cancel_url: 'https://example.com/cancel',
            notify_url: 'https://example.com/notify',
            accepted_pymt_type: 'INSTANT',
            skip_shipping_address: false,
            immutable_shipping_address: true,
          },
        },
      }),
    }
  );
  return await res.json();
}

// create billing agreement with token
export async function createBillingAgreement(token) {
  const accessToken = await generateAccessToken();
  const res = await fetch(
    'https://api-m.sandbox.paypal.com/v1/billing-agreements/agreements',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token_id: token }),
    }
  );
  return await res.json();
}

// create upstream order request (client-side shipping callbacks)
export const createUpstreamOrder = async totalAmount => {
  const accessToken = await generateAccessToken();
  const url = `${base}/v2/checkout/orders`;
  const response = await fetch(url, {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      payment_source: {
        paypal: {
          attributes: {
            // vault: {
            //   store_in_vault: 'ON_SUCCESS',
            //   usage_type: 'MERCHANT',
            //   customer_type: 'CONSUMER',
            // },
          },
          experience_context: {
            user_action: 'PAY_NOW',
            shipping_preference: 'GET_FROM_FILE',
            return_url: 'http://example.com',
            cancel_url: 'http://example.com',
          },
        },
      },
      purchase_units: [
        {
          amount: {
            currency_code: 'USD',
            value: totalAmount,
            breakdown: {
              item_total: {
                currency_code: 'USD',
                value: totalAmount,
              },
              shipping: {
                currency_code: 'USD',
                value: '0.00',
              },
            },
          },
          shipping: {
            options: [
              {
                id: '1',
                amount: {
                  currency_code: 'USD',
                  value: '0.00',
                },
                type: 'SHIPPING',
                label: 'Free Shipping',
                selected: true,
              },
              {
                id: '2',
                amount: {
                  currency_code: 'USD',
                  value: '10.00',
                },
                type: 'SHIPPING',
                label: 'Express Shipping',
                selected: false,
              },
            ],
          },
        },
      ],
    }),
  });

  return handleResponse(response);
};

// create upstream QL order request (server-side shipping callbacks)
export const createUpstreamQlOrder = async totalAmount => {
  const accessToken = await generateAccessToken();
  const payload = {
    intent: 'CAPTURE',
    payment_source: {
      paypal: {
        experience_context: {
          user_action: 'PAY_NOW',
          shipping_preference: 'GET_FROM_FILE',
          return_url:
            'https://pp-ql-best-practices.onrender.com/one-time-payments-cart-ql',
          cancel_url:
            'https://pp-ql-best-practices.onrender.com/one-time-payments-cart-ql',
          app_switch_preference: {
            launch_paypal_app: true,
          },
          order_update_callback_config: {
            callback_events: ['SHIPPING_ADDRESS'],
            // callback_events: ['SHIPPING_ADDRESS', 'SHIPPING_OPTIONS'],
            callback_url: CALLBACK_URL,
          },
        },
      },
    },
    purchase_units: [
      {
        amount: {
          currency_code: 'USD',
          value: totalAmount,
          breakdown: {
            item_total: {
              currency_code: 'USD',
              value: totalAmount,
            },
            shipping: {
              currency_code: 'USD',
              value: '0.00',
            },
          },
        },
        shipping: {
          options: [
            {
              id: '1',
              amount: {
                currency_code: 'USD',
                value: '0.00',
              },
              type: 'SHIPPING',
              label: 'Free Shipping',
              selected: true,
            },
            {
              id: '2',
              amount: {
                currency_code: 'USD',
                value: '10.00',
              },
              type: 'SHIPPING',
              label: 'Express Shipping',
              selected: false,
            },
          ],
        },
      },
    ],
  };

  const response = await fetch(`${base}/v2/checkout/orders`, {
    method: 'post',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  console.log('Create Order Response: ', await response.clone().json());
  return await handleResponse(response);
};

// create upstream Test QL order request (server-side shipping callbacks)
export const createQuantumOrder = async totalAmount => {
  const accessToken = await generateAccessToken();
  const payload = {
    intent: 'CAPTURE',
    payment_source: {
      paypal: {
        experience_context: {
          user_action: 'CONTINUE',
          shipping_preference: 'GET_FROM_FILE',
          return_url: 'https://pp-ql-best-practices.onrender.com/ql-test',
          cancel_url: 'https://pp-ql-best-practices.onrender.com/ql-test',
          app_switch_context: {
            native_app: {
              launch_paypal_app: true,
            },
          },
          order_update_callback_config: {
            callback_events: ['SHIPPING_ADDRESS'],
            // callback_events: ['SHIPPING_ADDRESS', 'SHIPPING_OPTIONS'],
            callback_url: CALLBACK_URL,
          },
        },
      },
    },
    purchase_units: [
      {
        amount: {
          currency_code: 'USD',
          value: totalAmount,
          breakdown: {
            item_total: {
              currency_code: 'USD',
              value: totalAmount,
            },
            shipping: {
              currency_code: 'USD',
              value: '0.00',
            },
          },
        },
        shipping: {
          options: [
            {
              id: '1',
              amount: {
                currency_code: 'USD',
                value: '0.00',
              },
              type: 'SHIPPING',
              label: 'Free Shipping',
              selected: true,
            },
            {
              id: '2',
              amount: {
                currency_code: 'USD',
                value: '10.00',
              },
              type: 'SHIPPING',
              label: 'Express Shipping',
              selected: false,
            },
          ],
        },
      },
    ],
  };

  const response = await fetch(`${base}/v2/checkout/orders`, {
    method: 'post',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  console.log('Create Order Response: ', await response.clone().json());
  return await handleResponse(response);
};

// create order request
export const createCheckoutOrder = async orderData => {
  console.log(
    'creating order from Checkout Page with data:',
    JSON.stringify(orderData)
  );
  const { shippingInfo, totalAmount, paymentSource = 'paypal' } = orderData;
  const purchaseAmount = totalAmount || '100.00'; // Use provided amount or default to 100.00
  const accessToken = await generateAccessToken();

  let shippingPreference = 'GET_FROM_FILE';
  let shippingDetails = {};

  if (shippingInfo) {
    shippingPreference = 'SET_PROVIDED_ADDRESS';
    shippingDetails = {
      name: {
        full_name: `${shippingInfo.firstName} ${shippingInfo.lastName}`,
      },
      address: {
        address_line_1: shippingInfo.address.addressLine1,
        admin_area_2: shippingInfo.address.adminArea2,
        admin_area_1: shippingInfo.address.adminArea1,
        postal_code: shippingInfo.address.postalCode,
        country_code: shippingInfo.address.countryCode,
      },
    };
  }

  // Build payment_source object dynamically
  let payment_source = {};
  if (paymentSource === 'paypal') {
    payment_source.paypal = {
      attributes: {
        vault: {
          store_in_vault: 'ON_SUCCESS',
          usage_type: 'MERCHANT',
          customer_type: 'CONSUMER',
        },
      },
      experience_context: {
        return_url: 'https://example.com/return', // <-- REQUIRED
        cancel_url: 'https://example.com/cancel', // <-- REQUIRED
        user_action: 'PAY_NOW',
        shipping_preference: shippingPreference,
      },
    };
  } else if (paymentSource === 'card') {
    payment_source.card = {
      attributes: {
        vault: {
          store_in_vault: 'ON_SUCCESS',
          usage_type: 'MERCHANT',
          customer_type: 'CONSUMER',
        },
      },
    };
  }

  const url = `${base}/v2/checkout/orders`;
  const response = await fetch(url, {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
      'PayPal-Request-Id': Date.now().toString(),
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          amount: {
            currency_code: 'USD',
            value: purchaseAmount,
          },
        },
      ],
      payment_source,
    }),
  });

  return handleResponse(response);
};

// capture payment request
export const capturePayment = async orderId => {
  // console.log('capturing payment with order ID:', orderId);
  const accessToken = await generateAccessToken();
  const url = `${base}/v2/checkout/orders/${orderId}/capture`;
  const response = await fetch(url, {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return handleResponse(response);
};

// create vault setup token
export const createVaultSetupToken = async ({ paymentSource }) => {
  // console.log('creating vault setup token for payment source:', paymentSource);
  const paymentSources = {
    paypal: {
      description: 'Description for PayPal to be shown to PayPal payer',
      usage_pattern: 'IMMEDIATE',
      usage_type: 'MERCHANT',
      customer_type: 'CONSUMER',
      experience_context: {
        shipping_preference: 'NO_SHIPPING',
        payment_method_preference: 'IMMEDIATE_PAYMENT_REQUIRED',
        brand_name: 'EXAMPLE INC',
        locale: 'en-US',
        return_url: 'https://example.com/returnUrl',
        cancel_url: 'https://example.com/cancelUrl',
      },
    },
    card: {
      verification_method: 'SCA_WHEN_REQUIRED',
      experience_context: {
        shipping_preference: 'NO_SHIPPING',
      },
    },
  };

  const response = await fetch(`${base}/v3/vault/setup-tokens`, {
    method: 'post',
    headers: {
      'PayPal-Request-Id': Date.now().toString(),
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await generateAccessToken()}`,
    },
    body: JSON.stringify({
      payment_source: {
        [paymentSource]: paymentSources[paymentSource],
      },
    }),
  });

  console.log(
    'Create Vault Setup Token Response: ',
    JSON.stringify(await response.clone().json(), null, 2)
  );
  return handleResponse(response);
};

// create vault payment token
export const createVaultPaymentToken = async vaultSetupToken => {
  const response = await fetch(`${base}/v3/vault/payment-tokens`, {
    method: 'post',
    headers: {
      'PayPal-Request-Id': Date.now().toString(),
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await generateAccessToken()}`,
    },
    body: JSON.stringify({
      payment_source: {
        token: {
          id: vaultSetupToken,
          type: 'SETUP_TOKEN',
        },
      },
    }),
  });

  const jsonResponse = await response.clone().json();
  console.log(
    'Create Vault Payment Token Response: ',
    JSON.stringify(jsonResponse, null, 2)
  );
  return handleResponse(response);
};

// create payment token from customer ID
export const createPaymentTokenFromCustomerId = async customerId => {
  const accessToken = await generateAccessToken();
  const response = await fetch(`${base}/v3/vault/payment-tokens`, {
    method: 'post',
    headers: {
      'PayPal-Request-Id': Date.now().toString(),
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      payment_source: {
        customer: {
          id: customerId,
          type: 'CUSTOMER_ID',
        },
      },
    }),
  });

  return handleResponse(response);
};

// get payment tokens from customer ID
export const fetchPaymentTokens = async customerId => {
  const accessToken = await generateAccessToken();
  const response = await fetch(
    `https://api-m.sandbox.paypal.com/v3/vault/payment-tokens?customer_id=${customerId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
  const data = await response.json();
  return data.payment_tokens || [];
};

// Create order with Billing Agreement ID
export async function createOrderWithBillingAgreement(
  billingAgreementId,
  amount = '10.00'
) {
  const accessToken = await generateAccessToken();
  console.log('billingAgreementId: ', billingAgreementId);
  const payload = {
    intent: 'CAPTURE',
    purchase_units: [
      {
        amount: {
          currency_code: 'USD',
          value: amount,
        },
      },
    ],
    payment_source: {
      token: {
        id: billingAgreementId,
        type: 'BILLING_AGREEMENT',
      },
    },
  };
  console.log('Order payload:', JSON.stringify(payload, null, 2));
  const response = await fetch(
    'https://api-m.sandbox.paypal.com/v2/checkout/orders',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    }
  );
  console.log('Create Order with Billing Agreement Response: ', response);
  return handleResponse(response);
}
